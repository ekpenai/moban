import Queue, { Job } from 'bull';
import * as path from 'path';
import * as winston from 'winston';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import puppeteer, { Browser } from 'puppeteer';
import { Mutex } from 'async-mutex';
import { createHash } from 'crypto';

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
  fonts?: PosterFontItem[];
};

type PosterFontItem = {
  label?: string;
  family?: string;
  source?: string;
  url?: string;
  fileUrl?: string;
  fontUrl?: string;
  aliases?: string[];
};

type RenderResult = {
  imageUrl?: string;
  imageBase64?: string;
};

const SERVER_BASE_URL = (process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

let browserPromise: Promise<Browser> | null = null;
let s3Client: S3Client | null = null;
let sharedPagePromise: Promise<any> | null = null;
const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const renderPageMutex = new Mutex();
const fontDataUrlCache = new Map<string, Promise<{ source: string; mimeType: string }>>();

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
  return ARABIC_SCRIPT_RE.test(text) ? 'rtl' : 'ltr';
}

function hasArabicScript(text: string | undefined): boolean {
  return !!text && ARABIC_SCRIPT_RE.test(text);
}

function buildFontStack(fontFamily: string | undefined, prefersArabic: boolean): string {
  const families = [
    fontFamily ? quoteCssFontFamily(fontFamily) : '',
    prefersArabic ? quoteCssFontFamily('Noto Naskh Arabic') : '',
    prefersArabic ? quoteCssFontFamily('Noto Sans Arabic') : '',
    quoteCssFontFamily('Noto Sans CJK SC'),
    quoteCssFontFamily('Noto Sans SC'),
    quoteCssFontFamily('Noto Sans'),
    quoteCssFontFamily('Microsoft YaHei'),
    quoteCssFontFamily('PingFang SC'),
    quoteCssFontFamily('Helvetica Neue'),
    'Arial',
    'sans-serif',
  ].filter(Boolean);

  return families.join(', ');
}

function quoteCssFontFamily(value: string): string {
  const name = String(value || '').trim();
  if (!name) return '';

  const genericFamilies = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'emoji',
    'math',
    'fangsong',
    'inherit',
    'initial',
    'unset',
    'revert',
    'revert-layer',
  ]);
  const lowerName = name.toLowerCase();
  if (genericFamilies.has(lowerName)) return lowerName;

  return `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function normalizeRenderPayload(template: any): RenderPayload {
  if (Array.isArray(template?.texts) || Array.isArray(template?.images) || template?.backgroundImage) {
    return {
      width: Number(template.width) || 1080,
      height: Number(template.height) || 1920,
      backgroundImage: template.backgroundImage,
      texts: Array.isArray(template.texts) ? template.texts : [],
      images: Array.isArray(template.images) ? template.images : [],
      fonts: normalizeFontItems(template.fonts),
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
    fonts: normalizeFontItems(template?.fonts),
  };
}

function normalizeFontItems(fonts: unknown): PosterFontItem[] {
  if (!Array.isArray(fonts)) return [];
  return fonts
    .map((font: any) => {
      const family = String(font?.family || font?.fontFamily || '').trim();
      const source = normalizeAssetUrl(String(font?.source || font?.url || font?.fileUrl || font?.fontUrl || '').trim());
      if (!family || !source) return null;
      return {
        label: String(font?.label || font?.name || family),
        family,
        source,
        aliases: ([] as string[])
          .concat(Array.isArray(font?.aliases) ? font.aliases.map((item: unknown) => String(item)) : [])
          .concat(font?.label ? [String(font.label)] : [])
          .concat(font?.name ? [String(font.name)] : [])
          .concat(family ? [family] : [])
          .filter(Boolean)
          .map((item: any) => String(item).trim())
          .filter(Boolean),
      };
    })
    .filter(Boolean) as PosterFontItem[];
}

async function discoverFontFaces(fonts: PosterFontItem[] = []): Promise<string> {
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

  const remoteEntries = await Promise.all(
    fonts
      .filter((font) => font.family && font.source)
      .map(async (font) => {
        const resolved = await resolveFontSource(normalizeAssetUrl(String(font.source)));
        return {
          family: String(font.family),
          aliases: Array.isArray(font.aliases) ? font.aliases : [],
          source: resolved.source,
          mimeType: resolved.mimeType,
        };
      }),
  );
  const remoteFontFaces = remoteEntries.flatMap((font) => buildRemoteFontFaceCss(font));

  if (fontFiles.length === 0 && remoteFontFaces.length === 0) {
    logger.warn('[Poster] No custom fonts found under worker/fonts or fonts. Falling back to installed fonts.');
    return '';
  }

  const localFontFaces = fontFiles
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

  return [...remoteFontFaces, localFontFaces].join('\n');
}

async function buildPosterHtml(payload: RenderPayload): Promise<string> {
  const width = Math.max(1, Math.round(payload.width));
  const height = Math.max(1, Math.round(payload.height));
  const fontFaces = await discoverFontFaces(payload.fonts || []);

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
      const containsArabic = hasArabicScript(item.text);
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
      const fontFamily = buildFontStack(item.fontFamily, containsArabic || direction === 'rtl');
      const language = containsArabic || direction === 'rtl' ? 'ar' : 'zh-CN';
      const textClass = direction === 'rtl' ? 'poster-text poster-text-rtl' : 'poster-text poster-text-ltr';

      return `
        <div
          class="${textClass}"
          dir="${direction}"
          lang="${language}"
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
        ><span class="poster-text-content">${escapeHtml(item.text)}</span></div>`;
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
            font-family: 'Noto Sans CJK SC', 'Noto Sans', 'Noto Naskh Arabic', 'Noto Sans Arabic', sans-serif;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
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
            word-break: normal;
            overflow-wrap: break-word;
            unicode-bidi: isolate;
            transform-origin: center center;
            line-break: auto;
            font-kerning: normal;
            font-variant-ligatures: common-ligatures contextual;
          }

          .poster-text-content {
            display: block;
          }

          .poster-text-rtl {
            unicode-bidi: plaintext;
            transform-origin: top right;
          }

          .poster-text-rtl .poster-text-content {
            direction: rtl;
            unicode-bidi: plaintext;
            text-align: inherit;
          }

          .poster-text-ltr {
            transform-origin: top left;
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

function buildRemoteFontFaceCss(font: { family: string; aliases: string[]; source: string; mimeType: string }): string[] {
  const names = [font.family].concat(font.aliases || []).filter(Boolean);
  const format = detectFontFormat(font.mimeType, font.source);
  return [...new Set(names)].map((name) => `
        @font-face {
          font-family: ${quoteCssFontFamily(String(name))};
          src: url("${escapeHtml(font.source)}")${format ? ` format("${format}")` : ''};
          font-display: block;
          font-style: normal;
          font-weight: 100 900;
        }
      `);
}

async function resolveFontSource(url: string) {
  if (!url || /^data:/i.test(url)) {
    return {
      source: url,
      mimeType: inferFontMimeType(url),
    };
  }
  const cacheKey = createHash('sha1').update(url).digest('hex');
  if (!fontDataUrlCache.has(cacheKey)) {
    const request: Promise<{ source: string; mimeType: string }> = (async () => {
      try {
        return await fetchFontAsDataUrl(url);
      } catch (error) {
        fontDataUrlCache.delete(cacheKey);
        logger.warn(`Failed to inline font ${url}: ${error instanceof Error ? error.message : String(error)}`);
        return {
          source: url,
          mimeType: inferFontMimeType(url),
        };
      }
    })();
    fontDataUrlCache.set(cacheKey, request);
  }
  return fontDataUrlCache.get(cacheKey)!;
}

async function fetchFontAsDataUrl(url: string) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = inferFontMimeType(url, response.headers.get('content-type'), buffer);
      const base64 = buffer.toString('base64');
      return {
        source: `data:${mimeType};base64,${base64}`,
        mimeType,
      };
    }

    if (response.status === 429 && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      continue;
    }

    throw new Error(`font fetch failed ${response.status} ${response.statusText}`);
  }

  throw new Error('font fetch failed after retries');
}

function inferFontMimeType(...values: Array<string | null | undefined | Buffer>): string {
  const buffer = values.find((value): value is Buffer => Buffer.isBuffer(value));
  if (buffer?.slice(0, 4).toString('hex') === '00010000') return 'font/truetype';
  if (buffer?.slice(0, 4).toString('ascii') === 'OTTO') return 'font/otf';
  if (buffer?.slice(0, 4).toString('ascii') === 'wOFF') return 'font/woff';
  if (buffer?.slice(0, 4).toString('ascii') === 'wOF2') return 'font/woff2';

  const input = values
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (input.includes('woff2') || input.endsWith('.woff2')) return 'font/woff2';
  if (input.includes('woff') || input.endsWith('.woff')) return 'font/woff';
  if (input.includes('opentype') || input.endsWith('.otf')) return 'font/otf';
  if (input.includes('truetype') || input.endsWith('.ttf')) return 'font/truetype';
  return 'font/truetype';
}

function detectFontFormat(mimeType: string, source: string): string {
  const input = `${mimeType || ''} ${source || ''}`.toLowerCase();
  if (input.includes('woff2')) return 'woff2';
  if (input.includes('woff')) return 'woff';
  if (input.includes('.otf') || input.includes('opentype')) return 'opentype';
  if (input.includes('.ttf') || input.includes('truetype')) return 'truetype';
  return '';
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

async function getSharedPage(): Promise<any> {
  if (!sharedPagePromise) {
    sharedPagePromise = (async () => {
      const browser = await getBrowser();
      const page = await browser.newPage();
      await page.setBypassCSP(true);
      return page;
    })().catch((error) => {
      sharedPagePromise = null;
      throw error;
    });
  }

  return sharedPagePromise;
}

async function waitForImages(page: any): Promise<void> {
  await page.evaluate(async () => {
    const withTimeout = async (promise: Promise<unknown>, timeoutMs: number) => {
      await Promise.race([
        promise,
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    };

    const textNodes = Array.from(document.querySelectorAll<HTMLElement>('.poster-text'));
    await Promise.all(
      textNodes.map((node) =>
        withTimeout(
          (async () => {
            if (!document.fonts?.load) return;
            const computed = window.getComputedStyle(node);
            const sampleText = node.innerText || node.textContent || 'Sample';
            await document.fonts.load(computed.font, sampleText);
          })(),
          4000,
        ),
      ),
    );

    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) =>
        withTimeout(
          (async () => {
            if (!image.complete) {
              await new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), { once: true });
              });
            }
            if (typeof image.decode === 'function') {
              try {
                await image.decode();
              } catch {
                // Ignore decode failures and fall back to the already loaded bitmap.
              }
            }
          })(),
          6000,
        ),
      ),
    );

    if (document.fonts?.ready) {
      await withTimeout(document.fonts.ready, 5000);
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function renderImage(template: any, onProgress?: (progress: number) => Promise<void> | void): Promise<Buffer> {
  return renderPageMutex.runExclusive(async () => {
    const payload = normalizeRenderPayload(template);
    await onProgress?.(10);
    const page = await getSharedPage();
    await onProgress?.(20);
    const width = Math.max(1, Math.round(payload.width));
    const height = Math.max(1, Math.round(payload.height));

    logger.info(
      `[Poster] Rendering via Puppeteer width=${width} height=${height} texts=${payload.texts?.length || 0} images=${
        payload.images?.length || 0
      } background=${payload.backgroundImage ? 'yes' : 'no'}`,
    );

    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 2,
    });
    await onProgress?.(35);

    await page.setContent(await buildPosterHtml(payload), {
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
  });
}

async function notifyServer(job: Job, payload: {
  status?: string;
  stage: string;
  progress: number;
  message: string;
  level?: 'info' | 'warn' | 'error';
  imageUrl?: string | null;
  failedReason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  meta?: Record<string, unknown>;
}) {
  const userId = job.data?.userId;
  const token = process.env.WORKER_INTERNAL_TOKEN || '';
  if (!userId || !SERVER_BASE_URL) return;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    await axios.post(`${SERVER_BASE_URL}/internal/render-jobs/${job.id}/events`, {
      userId,
      status: payload.status,
      stage: payload.stage,
      progress: payload.progress,
      message: payload.message,
      level: payload.level || 'info',
      imageUrl: payload.imageUrl,
      failedReason: payload.failedReason,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
      meta: payload.meta || null,
    }, {
      headers,
      timeout: 10000,
    });
  } catch (error) {
    logger.warn(`[Worker] Failed to notify server for job ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
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
  const startedAt = new Date().toISOString();
  try {
    await job.progress(5);
    await notifyServer(job, {
      status: 'processing',
      stage: 'booting_browser',
      progress: 5,
      message: 'Worker picked up render job',
      startedAt,
    });

    await notifyServer(job, {
      status: 'processing',
      stage: 'normalizing_template',
      progress: 10,
      message: 'Normalizing template payload',
    });

    const outputBuffer = await renderImage(job.data.template, async (progress) => {
      await job.progress(progress);
      const stage =
        progress >= 95 ? 'capturing_image'
          : progress >= 75 ? 'loading_assets'
            : progress >= 55 ? 'rendering_html'
              : progress >= 35 ? 'booting_browser'
                : 'normalizing_template';
      await notifyServer(job, {
        status: 'processing',
        stage,
        progress,
        message: `Render progress ${progress}%`,
      });
    });
    await job.progress(96);
    await notifyServer(job, {
      status: 'processing',
      stage: 'uploading_result',
      progress: 96,
      message: 'Uploading rendered image to object storage',
    });
    const imageUrl = await uploadRenderBuffer(outputBuffer);
    await job.progress(100);
    logger.info(
      `[Worker] Completed job ${job.id}, outputLength=${outputBuffer.length}, uploaded=${imageUrl ? 'yes' : 'no'}`,
    );
    const completedAt = new Date().toISOString();
    await notifyServer(job, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      message: 'Render job completed successfully',
      imageUrl,
      completedAt,
      meta: { outputLength: outputBuffer.length },
    });
    const result: RenderResult = imageUrl
      ? { imageUrl }
      : { imageBase64: `data:image/png;base64,${outputBuffer.toString('base64')}` };
    return result;
  } catch (error) {
    logger.error(`[Worker] Error on job ${job.id}:`, error instanceof Error ? error.stack || error.message : String(error));
    await notifyServer(job, {
      status: 'failed',
      stage: 'failed',
      progress: 100,
      message: error instanceof Error ? error.message : 'render failed',
      level: 'error',
      failedReason: error instanceof Error ? error.message : 'render failed',
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
});

logger.info('[Worker] is ready to process render jobs.');

async function closeWorkerAndBrowser() {
  await worker.close();
  if (sharedPagePromise) {
    const page = await sharedPagePromise;
    await page.close();
    sharedPagePromise = null;
  }
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
