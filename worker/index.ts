import Queue, { Job } from 'bull';
import sharp from 'sharp';
import * as path from 'path';
import * as winston from 'winston';
import axios from 'axios';
import * as dotenv from 'dotenv';

// 深度对齐后端配置
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || process.env.REDIS_USER || undefined,
  password: process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Sharp 要求：贴图左上角 + 贴图宽高不能超出底图。
 * 超出画布的区域需要先裁掉再 composite。
 */
async function clipRasterToCanvas(
  input: Buffer,
  layerX: number,
  layerY: number,
  bufferWidth: number,
  bufferHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): Promise<{ input: Buffer; left: number; top: number } | null> {
  const lx = Math.round(layerX);
  const ly = Math.round(layerY);
  const lw = Math.max(1, bufferWidth);
  const lh = Math.max(1, bufferHeight);

  const interLeft = Math.max(0, lx);
  const interTop = Math.max(0, ly);
  const interRight = Math.min(canvasWidth, lx + lw);
  const interBottom = Math.min(canvasHeight, ly + lh);

  if (interRight <= interLeft || interBottom <= interTop) return null;

  const cropX = interLeft - lx;
  const cropY = interTop - ly;
  const cropW = interRight - interLeft;
  const cropH = interBottom - interTop;

  if (cropW < 1 || cropH < 1) return null;

  const clipped = await sharp(input)
    .extract({
      left: cropX,
      top: cropY,
      width: cropW,
      height: cropH,
    })
    .toBuffer();

  return { input: clipped, left: interLeft, top: interTop };
}

function getPublicBaseUrl(): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || process.env.SERVER_BASE_URL || '').trim();
  return fromEnv.replace(/\/+$/, '');
}

function normalizeAssetUrl(url: string): string {
  const base = getPublicBaseUrl();
  if (!base) return url;
  return url.replace(/^https?:\/\/localhost:3000(?=\/|$)/i, base);
}

// Simplified renderer using sharp composition
async function renderImage(template: any): Promise<string> {
  logger.info(`Starting render process for template width: ${template.width}, layers: ${template.layers.length}`);
  const width = template.width;
  const height = template.height;

  const composites: sharp.OverlayOptions[] = [];

  for (const layer of template.layers) {
    try {
      if (layer.type === 'image' && layer.url) {
        let input: Buffer;
        if (layer.url.startsWith('data:image')) {
          const base64Data = layer.url.replace(/^data:image\/\w+;base64,/, '');
          input = Buffer.from(base64Data, 'base64');
        } else if (layer.url.startsWith('http')) {
          const response = await axios.get(normalizeAssetUrl(layer.url), {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 50 * 1024 * 1024,
          });
          input = Buffer.from(response.data);
          logger.info(`Successfully fetched remote asset: ${normalizeAssetUrl(layer.url)}`);
        } else {
          continue;
        }

        if (input) {
          const rw = Math.max(1, Math.round(layer.width));
          const rh = Math.max(1, Math.round(layer.height));
          let processedInput = await sharp(input)
            .resize({
              width: rw,
              height: rh,
              fit: 'fill',
            })
            .toBuffer();

          // 应用图层蒙版处理 (Layer Mask)
          if (layer.maskUrl) {
            let maskInput: Buffer | null = null;
            try {
              if (layer.maskUrl.startsWith('data:image')) {
                const base64Data = layer.maskUrl.replace(/^data:image\/\w+;base64,/, '');
                maskInput = Buffer.from(base64Data, 'base64');
              } else if (layer.maskUrl.startsWith('http')) {
                const maskRes = await axios.get(normalizeAssetUrl(layer.maskUrl), {
                  responseType: 'arraybuffer',
                  timeout: 30000,
                });
                maskInput = Buffer.from(maskRes.data);
              }
            } catch (e) {
              logger.error(`Failed to fetch maskUrl for layer ${layer.id}:`, (e as Error).message);
            }

            if (maskInput) {
              const maskRectW = layer.maskRect ? Math.max(1, Math.round(layer.maskRect.width)) : rw;
              const maskRectH = layer.maskRect ? Math.max(1, Math.round(layer.maskRect.height)) : rh;
              const maskOffsetX = layer.maskRect ? Math.round(layer.maskRect.x - layer.x) : 0;
              const maskOffsetY = layer.maskRect ? Math.round(layer.maskRect.y - layer.y) : 0;

              // 1. 将蒙版调整为 maskRect 大小并提取亮度作为透明度（灰度图，单通道）
              const resizedMask = await sharp(maskInput)
                .resize({ width: maskRectW, height: maskRectH, fit: 'fill' })
                .extractChannel('red') // 提取 R 通道作为灰度值
                .raw()
                .toBuffer();

              // 2. 创建一个等同于当前图层宽高的全透明单通道底图
              const fullMaskAlpha = await sharp({
                create: { width: rw, height: rh, channels: 1, background: { r: 0 } } // 0 = 完全透明
              })
                // 将缩放后的蒙版粘贴到相对偏移位置上
                .composite([
                  {
                    input: resizedMask,
                    raw: { width: maskRectW, height: maskRectH, channels: 1 },
                    left: maskOffsetX,
                    top: maskOffsetY
                  }
                ])
                .raw()
                .toBuffer();

              // 3. 将最终的 alpha 蒙版应用到我们的图层图片上
              processedInput = await sharp(processedInput)
                .removeAlpha() // 去除原图可能存在的透明通道，避免冲突
                .joinChannel(fullMaskAlpha, { raw: { width: rw, height: rh, channels: 1 } })
                .png()
                .toBuffer();
            }
          }

          const clipped = await clipRasterToCanvas(
            processedInput,
            layer.x,
            layer.y,
            rw,
            rh,
            width,
            height,
          );
          if (clipped) {
            composites.push(clipped);
          }
        }
      } else if (layer.type === 'text' && layer.text) {
      // Create SVG text layer to composite into Sharp
      const padding = 10;
      const color = typeof layer.color === 'string' ? layer.color : '#000000';
      const fontFamily = layer.fontFamily ? escapeXml(layer.fontFamily) + ', Arial, sans-serif' : 'Arial, sans-serif';
      const direction = layer.direction === 'rtl' ? 'rtl' : 'ltr';
      const align = layer.textAlign || 'left';
      
      const svgW = Math.max(1, Math.round(layer.width + padding));
      const svgH = Math.max(1, Math.round(layer.height + padding));
      
      let textAnchor = 'start';
      let xPos = 0;
      
      if (align === 'center') {
        textAnchor = 'middle';
        xPos = svgW / 2;
      } else if (align === 'right' || (direction === 'rtl' && align !== 'left')) {
        textAnchor = 'end';
        xPos = svgW;
      }

      // 处理 autoScale 缩放逻辑
      const autoScaleProps = layer.autoScale 
        ? `textLength="${Math.max(1, layer.width)}" lengthAdjust="spacingAndGlyphs"`
        : '';

      const svgText = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
          <text x="${xPos}" y="${Math.round(layer.fontSize)}" font-size="${layer.fontSize}" font-family="${fontFamily}" fill="${escapeXml(color)}" text-anchor="${textAnchor}" direction="${direction}" ${autoScaleProps}>
            ${escapeXml(String(layer.text))}
          </text>
        </svg>
      `;
      const svgPng = await sharp(Buffer.from(svgText)).png().toBuffer();
      const clippedText = await clipRasterToCanvas(
        svgPng,
        layer.x,
        layer.y,
        svgW,
        svgH,
        width,
        height,
      );
      if (clippedText) {
        composites.push(clippedText);
      }
    }
  } catch (err) {
    logger.error(`Failed to process layer ${layer.id}:`, (err as Error).message);
  }
}

  // Create a blank background image
  const baseCanvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const outputBuffer = await baseCanvas
    .composite(composites)
    .png()
    .toBuffer();

  // Return image directly to avoid cross-container shared-disk issues in Sealos.
  return `data:image/png;base64,${outputBuffer.toString('base64')}`;
}

const worker = new Queue('renderQueue', { redis: connection });

logger.info('[Worker] Connected to Redis. Registering EXPLICIT process handler (render-job, Concurrency: 5)...');

worker.process('render-job', 5, async (job: Job) => {
  logger.info(`[Worker] Picked up job ${job.id} (Name: ${job.name}, Attempt: ${job.attemptsMade + 1})`);
  try {
    const outputUrl = await renderImage(job.data.template);
    logger.info(`[Worker] Completed job ${job.id}, output: ${outputUrl}`);
    return outputUrl;
  } catch (error) {
    logger.error(`[Worker] Error on job ${job.id}:`, error);
    throw error;
  }
});

logger.info('[Worker] is ready to process render jobs.');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('[Worker] SIGTERM received. Closing queue...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('[Worker] SIGINT received. Closing queue...');
  await worker.close();
  process.exit(0);
});
