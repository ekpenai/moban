import Queue, { Job } from 'bull';
import * as path from 'path';
import * as winston from 'winston';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import puppeteer, { Browser } from 'puppeteer';

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  username: process.env.REDIS_USERNAME || process.env.REDIS_USER || undefined,
  password: process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

type PosterTextItem = {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  rotate?: number;
  rotation?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  align?: string;
  textAlign?: string;
  direction?: string;
  lineHeight?: number;
  letterSpacing?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
};

type PosterImageItem = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  borderRadius?: number;
  maskUrl?: string;
  maskRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type RenderPayload = {
  width: number;
  height: number;
  backgroundImage?: string;
  texts?: PosterTextItem[];
  images?: PosterImageItem[];
};

type RenderResult = {
  imageUrl?: string;
  imageBase64?: string;
};

let browserPromise: Promise<Browser> | null = null;
let s3Client: S3Client | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toCssColor(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeAssetUrl(url: string): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.SERVER_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return url;
  return url.replace(/^https?:\/\/localhost:3000(?=\/|$)/i, base);
}

function detectDirection(text: string | undefined, direction?: string): 'rtl' | 'ltr' {
  if (direction === 'rtl' || direction === 'ltr') return direction;
  if (!text) return 'ltr';
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text) ? 'rtl' : 'ltr';
}

function normalizeRenderPayload(template: any): RenderPayload {
  if (Array.isArray(template?.texts) || Array.isArray(template?.images) || template?.backgroundImage) {
    return {
      width: Number(template.width) || 1080,
      height: Number(template.height) || 1920,
      backgroundImage: template.backgroundImage,
      texts: Array.isArray(template.texts) ? template.texts : [],
      images: Array.isArray(template.images) ? template.images : [],
    };
  }

  const layers = Array.isArray(template?.layers) ? template.layers : [];
  const images: PosterImageItem[] = [];
  const texts: PosterTextItem[] = [];

  for (const layer of layers) {
    if (layer?.visible === false) continue;

    if (layer?.type === 'image' && layer?.url) {
      images.push({
        url: normalizeAssetUrl(layer.url),
        x: Number(layer.x) || 0,
        y: Number(layer.y) || 0,
        width: Math.max(1, Number(layer.width) || 1),
        height: Math.max(1, Number(layer.height) || 1),
        rotation: Number(layer.rotation) || 0,
        scaleX: Number(layer.scaleX) || 1,
        scaleY: Number(layer.scaleY) || 1,
        opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
        maskUrl: layer.maskUrl ? normalizeAssetUrl(layer.maskUrl) : undefined,
        maskRect: layer.maskRect,
      });
      continue;
    }

    if (layer?.type === 'text' && typeof layer.text === 'string') {
      texts.push({
        text: layer.text,
        x: Number(layer.x) || 0,
        y: Number(layer.y) || 0,
        width: Number(layer.width) || undefined,
        height: Number(layer.height) || undefined,
        fontSize: Number(layer.fontSize) || 32,
        color: layer.color,
        rotation: Number(layer.rotation) || 0,
        fontFamily: layer.fontFamily,
        fontWeight: layer.fontWeight,
        textAlign: layer.textAlign,
        direction: layer.direction,
        lineHeight: typeof layer.lineHeight === 'number' ? layer.lineHeight : 1.4,
        letterSpacing: typeof layer.letterSpacing === 'number' ? layer.letterSpacing : 0,
        scaleX: Number(layer.scaleX) || 1,
        scaleY: Number(layer.scaleY) || 1,
        opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
      });
    }
  }

  const backgroundImage = images.length > 0 && images[0].x === 0 && images[0].y === 0 ? images.shift()?.url : undefined;

  return {
    width: Number(template?.width) || 1080,
    height: Number(template?.height) || 1920,
    backgroundImage,
    texts,
    images,
  };
}

function discoverFontFaces(): string {
  const fontDirs = [
    path.join(__dirname, 'fonts'),
    path.join(__dirname, '..', 'fonts'),
    path.join(process.cwd(), 'fonts'),
  ];
  const fontFiles: string[] = [];

  for (const dir of fontDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (/\.(ttf|otf|woff2?)$/i.test(entry)) {
        fontFiles.push(path.join(dir, entry));
      }
    }
  }

  if (fontFiles.length === 0) {
    logger.warn('[Poster] No custom fonts found under worker/fonts or fonts. Falling back to installed fonts.');
    return '';
  }

  return fontFiles
    .map((filePath) => {
      const family = path.basename(filePath).replace(/\.(ttf|otf|woff2?)$/i, '');
      const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
      return `
        @font-face {
          font-family: "${escapeHtml(family)}";
          src: url("${fileUrl}");
          font-display: swap;
        }
      `;
    })
    .join('\n');
}

function buildPosterHtml(payload: RenderPayload): string {
  const width = Math.max(1, Math.round(payload.width));
  const height = Math.max(1, Math.round(payload.height));
  const fontFaces = discoverFontFaces();

  const backgroundHtml = payload.backgroundImage
    ? `<img class="poster-bg" src="${escapeHtml(normalizeAssetUrl(payload.backgroundImage))}" alt="" />`
    : '';

  const imageHtml = (payload.images || [])
    .map((image, index) => {
      const rotation = Number(image.rotate ?? image.rotation ?? 0) || 0;
      const scaleX = Number(image.scaleX) || 1;
      const scaleY = Number(image.scaleY) || 1;
      const opacity = typeof image.opacity === 'number' ? image.opacity : 1;
      const maskCss =
        image.maskUrl && image.maskRect
          ? `
            -webkit-mask-image: url("${escapeHtml(normalizeAssetUrl(image.maskUrl))}");
            -webkit-mask-repeat: no-repeat;
            -webkit-mask-size: ${Math.max(1, Math.round(image.maskRect.width))}px ${Math.max(1, Math.round(image.maskRect.height))}px;
            -webkit-mask-position: ${Math.round(image.maskRect.x - image.x)}px ${Math.round(image.maskRect.y - image.y)}px;
            mask-image: url("${escapeHtml(normalizeAssetUrl(image.maskUrl))}");
            mask-repeat: no-repeat;
            mask-size: ${Math.max(1, Math.round(image.maskRect.width))}px ${Math.max(1, Math.round(image.maskRect.height))}px;
            mask-position: ${Math.round(image.maskRect.x - image.x)}px ${Math.round(image.maskRect.y - image.y)}px;
          `
          : '';

      return `
        <img
          class="poster-image"
          src="${escapeHtml(normalizeAssetUrl(image.url))}"
          alt=""
          style="
            left:${Math.round(image.x)}px;
            top:${Math.round(image.y)}px;
            width:${Math.max(1, Math.round(image.width))}px;
            height:${Math.max(1, Math.round(image.height))}px;
            opacity:${opacity};
            border-radius:${Math.max(0, Math.round(image.borderRadius || 0))}px;
            transform: translateZ(0) rotate(${rotation}deg) scale(${scaleX}, ${scaleY});
            z-index:${index + 1};
            ${maskCss}
          "
        />`;
    })
    .join('\n');

  const textHtml = (payload.texts || [])
    .map((item, index) => {
      const direction = detectDirection(item.text, item.direction);
      const align = (item.align || item.textAlign || (direction === 'rtl' ? 'right' : 'left')).toLowerCase();
      const rotation = Number(item.rotate ?? item.rotation ?? 0) || 0;
      const scaleX = Number(item.scaleX) || 1;
      const scaleY = Number(item.scaleY) || 1;
      const widthStyle = item.width ? `width:${Math.max(1, Math.round(item.width))}px;` : '';
      const heightStyle = item.height ? `min-height:${Math.max(1, Math.round(item.height))}px;` : '';
      const opacity = typeof item.opacity === 'number' ? item.opacity : 1;
      const lineHeight = typeof item.lineHeight === 'number' && item.lineHeight > 0 ? item.lineHeight : 1.4;
      const letterSpacing = typeof item.letterSpacing === 'number' ? item.letterSpacing : 0;
      const fontWeight = item.fontWeight ?? 'normal';
      const fontFamily = item.fontFamily ? `"${escapeHtml(item.fontFamily)}"` : '"Noto Naskh Arabic"';

      return `
        <div
          class="poster-text"
          style="
            left:${Math.round(item.x)}px;
            top:${Math.round(item.y)}px;
            ${widthStyle}
            ${heightStyle}
            font-size:${Math.max(1, Math.round(item.fontSize || 32))}px;
            color:${escapeHtml(toCssColor(item.color, '#111111'))};
            font-family:${fontFamily}, 'Noto Naskh Arabic', serif;
            font-weight:${escapeHtml(String(fontWeight))};
            text-align:${escapeHtml(align)};
            direction:${direction};
            line-height:${lineHeight};
            letter-spacing:${letterSpacing}px;
            opacity:${opacity};
            transform: translateZ(0) rotate(${rotation}deg) scale(${scaleX}, ${scaleY});
            z-index:${100 + index};
          "
        >${escapeHtml(item.text)}</div>`;
    })
    .join('\n');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          ${fontFaces}

          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            width: ${width}px;
            height: ${height}px;
            overflow: hidden;
            background: transparent;
          }

          body {
            font-family: 'Noto Naskh Arabic', serif;
            -webkit-font-smoothing: antialiased;
            text-rendering: geometricPrecision;
          }

          .poster {
            position: relative;
            width: ${width}px;
            height: ${height}px;
            overflow: hidden;
            background: #ffffff;
          }

          .poster-bg,
          .poster-image {
            position: absolute;
            display: block;
            object-fit: cover;
            transform-origin: center center;
          }

          .poster-bg {
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
          }

          .poster-text {
            position: absolute;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: anywhere;
            unicode-bidi: plaintext;
            transform-origin: center center;
          }
        </style>
      </head>
      <body>
        <div class="poster">
          ${backgroundHtml}
          ${imageHtml}
          ${textHtml}
        </div>
      </body>
    </html>
  `;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--font-render-hinting=none',
        '--disable-dev-shm-usage',
      ],
    });
  }
  return browserPromise;
}

async function waitForImages(page: any): Promise<void> {
  await page.evaluate(async () => {
    const withTimeout = async (promise: Promise<unknown>, timeoutMs: number) => {
      await Promise.race([
        promise,
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    };

    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) =>
        withTimeout(
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
          8000,
        ),
      ),
    );

    if (document.fonts?.ready) {
      await withTimeout(document.fonts.ready, 5000);
    }
  });
}

async function renderImage(template: any, onProgress?: (progress: number) => Promise<void> | void): Promise<Buffer> {
  const payload = normalizeRenderPayload(template);
  await onProgress?.(10);
  const browser = await getBrowser();
  await onProgress?.(20);
  const page = await browser.newPage();
  const width = Math.max(1, Math.round(payload.width));
  const height = Math.max(1, Math.round(payload.height));

  logger.info(
    `[Poster] Rendering via Puppeteer width=${width} height=${height} texts=${payload.texts?.length || 0} images=${
      payload.images?.length || 0
    } background=${payload.backgroundImage ? 'yes' : 'no'}`,
  );

  try {
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 2,
    });
    await onProgress?.(35);

    await page.setContent(buildPosterHtml(payload), {
      waitUntil: 'domcontentloaded',
    });
    await onProgress?.(55);

    await waitForImages(page);
    await onProgress?.(75);

    const outputBuffer = await page.screenshot({
      type: 'png',
      omitBackground: false,
    });
    await onProgress?.(95);

    return Buffer.from(outputBuffer);
  } finally {
    await page.close();
  }
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint:
        process.env.NODE_ENV === 'production'
          ? 'http://object-storage.objectstorage-system.svc.cluster.local'
          : process.env.S3_ENDPOINT || 'https://objectstorageapi.bja.sealos.run',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'ujw2lrwn',
        secretAccessKey: process.env.S3_SECRET_KEY || '26mhbpxmjdj8qrnx',
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

async function uploadRenderBuffer(outputBuffer: Buffer): Promise<string | null> {
  const bucketName = (process.env.S3_BUCKET_NAME || '').trim();
  const publicUrl = (process.env.S3_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!bucketName || !publicUrl) {
    return null;
  }

  const filename = `renders/${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: outputBuffer,
      ContentType: 'image/png',
    }),
  );
  return `${publicUrl}/${filename}`;
}

const worker = new Queue('renderQueue', { redis: connection });

logger.info('[Worker] Connected to Redis. Registering render-job process handler (Puppeteer renderer, concurrency: 2)...');

worker.process('render-job', 2, async (job: Job) => {
  logger.info(`[Worker] Picked up job ${job.id} (Name: ${job.name}, Attempt: ${job.attemptsMade + 1})`);
  try {
    await job.progress(5);
    const outputBuffer = await renderImage(job.data.template, async (progress) => {
      await job.progress(progress);
    });
    await job.progress(96);
    const imageUrl = await uploadRenderBuffer(outputBuffer);
    await job.progress(100);
    logger.info(
      `[Worker] Completed job ${job.id}, outputLength=${outputBuffer.length}, uploaded=${imageUrl ? 'yes' : 'no'}`,
    );
    const result: RenderResult = imageUrl
      ? { imageUrl }
      : { imageBase64: `data:image/png;base64,${outputBuffer.toString('base64')}` };
    return result;
  } catch (error) {
    logger.error(`[Worker] Error on job ${job.id}:`, error instanceof Error ? error.stack || error.message : String(error));
    throw error;
  }
});

logger.info('[Worker] is ready to process render jobs.');

async function closeWorkerAndBrowser() {
  await worker.close();
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

process.on('SIGTERM', async () => {
  logger.info('[Worker] SIGTERM received. Closing queue and browser...');
  await closeWorkerAndBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('[Worker] SIGINT received. Closing queue and browser...');
  await closeWorkerAndBrowser();
  process.exit(0);
});
