import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser } from 'puppeteer-core';
import { S3Service } from './s3.service';
import { createHash } from 'crypto';

type DeliveryMode = 'url' | 'base64' | 'both';

type RenderFontFace = {
  family?: string;
  source?: string;
  url?: string;
  fileUrl?: string;
  fontUrl?: string;
  aliases?: string[];
  mimeType?: string;
};

type TextSegment = {
  text?: string;
  width?: number;
  fontSize?: number;
  style?: Record<string, any>;
};

type TextLine = {
  width?: number;
  height?: number;
  ascent?: number;
  segments?: TextSegment[];
};

type TextLayout = {
  width?: number;
  height?: number;
  lines?: TextLine[];
};

type TextLayer = {
  id?: string;
  name?: string;
  text?: string;
  width?: number;
  height?: number;
  maxWidth?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  fontSize?: number;
  direction?: string;
  textDirection?: string;
  textAlign?: string;
  lineHeight?: number;
  letterSpacing?: number;
  layout?: TextLayout;
  richText?: Array<Record<string, any>>;
};

type RenderedTextItem = {
  layerId: string;
  width: number;
  height: number;
  imageUrl?: string;
  imageBase64?: string;
  engine: 'browser';
};

type NormalizedLayer = {
  id: string;
  width: number;
  height: number;
  direction: 'rtl' | 'ltr';
  textAlign: string;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  fontFamily: string;
  fontWeight: string | number;
  fontSize: number;
  layout: {
    width: number;
    height: number;
    lines: Array<{
      width: number;
      height: number;
      ascent: number;
      segments: TextSegment[];
    }>;
  };
};

type FontFaceEntry = {
  family: string;
  source: string;
  aliases: string[];
  mimeType: string;
};

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

@Injectable()
export class TextRenderService implements OnModuleDestroy {
  private readonly logger = new Logger(TextRenderService.name);
  private browserPromise: Promise<Browser> | null = null;
  private readonly fontDataUrlCache = new Map<string, Promise<{ source: string; mimeType: string }>>();

  constructor(
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {}

  async renderLayer(layer: Record<string, any>, fonts: Record<string, any>[] = [], deliveryMode: DeliveryMode = 'both') {
    const [result] = await this.renderLayers([layer], fonts, deliveryMode);
    return result;
  }

  async renderLayers(layers: Record<string, any>[], fonts: Record<string, any>[] = [], deliveryMode: DeliveryMode = 'both') {
    const normalizedLayers = (layers || []).map((layer) => this.normalizeLayer(layer)).filter(Boolean) as NormalizedLayer[];
    if (!normalizedLayers.length) return [];

    const fontFaces = await this.normalizeFontFaces(fonts);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    const gap = 24;

    try {
      const stacked = normalizedLayers.map((layer, index) => {
        const top = normalizedLayers
          .slice(0, index)
          .reduce((sum, item) => sum + item.height + gap, 0);
        return { layer, top };
      });
      const viewportWidth = Math.max(1, ...stacked.map((item) => item.layer.width));
      const viewportHeight = Math.max(1, stacked.reduce((sum, item) => sum + item.layer.height + gap, 0));

      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 2,
      });

      await page.setContent(this.buildBatchHtml(stacked, fontFaces, viewportWidth, viewportHeight), {
        waitUntil: 'domcontentloaded',
      });
      await this.waitForFonts(page);

      const results: RenderedTextItem[] = [];
      for (const item of stacked) {
        const buffer = Buffer.from(
          await page.screenshot({
            type: 'png',
            omitBackground: true,
            clip: {
              x: 0,
              y: item.top,
              width: item.layer.width,
              height: item.layer.height,
            },
          }),
        );

        const rendered: RenderedTextItem = {
          layerId: item.layer.id,
          width: item.layer.width,
          height: item.layer.height,
          engine: 'browser',
        };

        if (deliveryMode === 'base64' || deliveryMode === 'both') {
          rendered.imageBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
        }

        if (deliveryMode === 'url' || deliveryMode === 'both') {
          try {
            rendered.imageUrl = await this.s3Service.uploadFile(buffer, `${item.layer.id}.png`, 'image/png', 'text-renders');
          } catch (error) {
            this.logger.warn(`Failed to upload text render ${item.layer.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        results.push(rendered);
      }

      return results;
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (!this.browserPromise) return;
    const browser = await this.browserPromise.catch(() => null);
    this.browserPromise = null;
    if (browser) {
      await browser.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const executablePath =
        this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') ||
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        '/usr/bin/chromium';

      this.browserPromise = puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
        ],
      }).catch((error) => {
        this.browserPromise = null;
        throw error;
      });
    }

    return this.browserPromise;
  }

  private normalizeLayer(layer: TextLayer): NormalizedLayer | null {
    if (!layer || !layer.layout || !Array.isArray(layer.layout.lines) || !layer.layout.lines.length) {
      return null;
    }

    const direction = this.detectDirection(layer);
    const width = Math.max(1, Math.round(Number(layer.layout.width || layer.width || layer.maxWidth || 1)));
    const measuredHeight = Number(layer.layout.height || layer.height || 1);
    const height = Math.max(
      1,
      Math.round(
        measuredHeight > 0
          ? measuredHeight
          : layer.layout.lines.reduce((sum, line) => sum + Math.max(1, Number(line.height) || 0), 0),
      ),
    );

    return {
      id: String(layer.id || `text_${Date.now()}_${Math.round(Math.random() * 1e6)}`),
      width,
      height,
      direction,
      textAlign: String(layer.textAlign || (direction === 'rtl' ? 'right' : 'left')).toLowerCase(),
      lineHeight: Number(layer.lineHeight) || 1.4,
      letterSpacing: Number(layer.letterSpacing) || 0,
      color: String(layer.color || '#333333'),
      fontFamily: String(layer.fontFamily || 'sans-serif'),
      fontWeight: layer.fontWeight || 'normal',
      fontSize: Number(layer.fontSize) || 32,
      layout: {
        width,
        height,
        lines: layer.layout.lines.map((line) => ({
          width: Math.max(0, Number(line.width) || 0),
          height: Math.max(1, Number(line.height) || 1),
          ascent: Math.max(0, Number(line.ascent) || 0),
          segments: Array.isArray(line.segments) ? line.segments : [],
        })),
      },
    };
  }

  private async normalizeFontFaces(fonts: Record<string, any>[] = []): Promise<FontFaceEntry[]> {
    const seen = new Set<string>();
    const entries = await Promise.all((fonts || [])
      .map(async (font) => {
        const family = String(font?.family || font?.fontFamily || '').trim();
        const rawSource = this.normalizeAssetUrl(String(font?.source || font?.url || font?.fileUrl || font?.fontUrl || '').trim());
        if (!family || !rawSource) return null;
        const aliases: string[] = ([] as string[])
          .concat(Array.isArray(font?.aliases) ? font.aliases.map((item: unknown) => String(item)) : [])
          .concat(font?.label ? [String(font.label)] : [])
          .concat(font?.name ? [String(font.name)] : [])
          .concat(family ? [family] : [])
          .filter(Boolean)
          .map((item) => String(item).trim())
          .filter(Boolean);
        const source = await this.resolveFontSource(rawSource);
        const key = `${family}__${source.source}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return { family, source: source.source, aliases: [...new Set(aliases)], mimeType: source.mimeType };
      }));

    return entries.filter(Boolean) as FontFaceEntry[];
  }

  private buildBatchHtml(
    stackedLayers: Array<{ layer: NormalizedLayer; top: number }>,
    fontFaces: FontFaceEntry[],
    width: number,
    height: number,
  ) {
    const fontFaceCss = fontFaces
      .flatMap((font) => this.buildFontFaceCss(font))
      .join('\n');

    const layersHtml = stackedLayers.map(({ layer, top }) => this.buildLayerHtml(layer, top)).join('\n');

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <style>
            ${fontFaceCss}

            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              width: ${width}px;
              height: ${height}px;
              overflow: hidden;
              background: transparent;
            }
            body {
              position: relative;
              font-family: "Noto Sans CJK SC", "Noto Sans", "Noto Naskh Arabic", "Noto Sans Arabic", sans-serif;
              -webkit-font-smoothing: antialiased;
              text-rendering: optimizeLegibility;
            }
            .text-layer {
              position: absolute;
              left: 0;
              overflow: hidden;
              background: transparent;
            }
            .text-layer[dir="rtl"] {
              unicode-bidi: plaintext;
            }
            .text-line {
              display: block;
              width: 100%;
              min-height: 1px;
              white-space: nowrap;
              font-kerning: normal;
              font-variant-ligatures: common-ligatures contextual;
            }
            .text-segment {
              display: inline;
              white-space: pre;
            }
          </style>
        </head>
        <body>
          ${layersHtml}
        </body>
      </html>
    `;
  }

  private buildLayerHtml(layer: NormalizedLayer, top: number) {
    const lineHtml = layer.layout.lines.map((line, index) => this.buildLineHtml(layer, line, index, layer.layout.lines.length)).join('');
    return `
      <div
        class="text-layer"
        dir="${layer.direction}"
        style="
          top:${top}px;
          width:${layer.width}px;
          height:${layer.height}px;
          color:${this.escapeHtml(layer.color)};
          font-family:${this.buildFontStack(layer.fontFamily, layer.direction === 'rtl')};
          font-size:${Math.max(1, Math.round(layer.fontSize))}px;
          font-weight:${this.escapeHtml(String(layer.fontWeight || 'normal'))};
          letter-spacing:${layer.letterSpacing}px;
          text-align:${this.escapeHtml(this.resolveLayerAlign(layer))};
        "
      >${lineHtml}</div>
    `;
  }

  private buildLineHtml(layer: NormalizedLayer, line: NormalizedLayer['layout']['lines'][number], index: number, totalLines: number) {
    const lineAlign = this.resolveLineAlign(layer, index, totalLines);
    const textAlignLast = this.resolveLineAlignLast(layer, index, totalLines);
    const segmentsHtml = line.segments.map((segment) => this.buildSegmentHtml(layer, segment)).join('');
    return `
      <div
        class="text-line"
        style="
          height:${Math.max(1, Math.round(line.height))}px;
          line-height:${Math.max(1, Math.round(line.height))}px;
          text-align:${this.escapeHtml(lineAlign)};
          text-align-last:${this.escapeHtml(textAlignLast)};
        "
      >${segmentsHtml}</div>
    `;
  }

  private buildSegmentHtml(layer: NormalizedLayer, segment: TextSegment) {
    const style = segment.style || {};
    const fontSize = Number(segment.fontSize || style.fontSize || layer.fontSize) || layer.fontSize;
    const fontFamily = String(style.fontFamily || layer.fontFamily || 'sans-serif');
    const fontWeight = style.fontWeight || layer.fontWeight || 'normal';
    const color = style.color || layer.color || '#333333';

    return `
      <span
        class="text-segment"
        style="
          font-size:${Math.max(1, Math.round(fontSize))}px;
          font-family:${this.buildFontStack(fontFamily, layer.direction === 'rtl')};
          font-weight:${this.escapeHtml(String(fontWeight))};
          color:${this.escapeHtml(String(color))};
        "
      >${this.escapeHtml(String(segment.text || ''))}</span>
    `;
  }

  private buildFontStack(fontFamily: string, prefersArabic: boolean) {
    const families = [
      fontFamily ? `"${this.escapeHtml(fontFamily)}"` : '',
      prefersArabic ? '"Noto Naskh Arabic"' : '',
      prefersArabic ? '"Noto Sans Arabic"' : '',
      '"Noto Sans CJK SC"',
      '"Noto Sans SC"',
      '"Noto Sans"',
      '"Microsoft YaHei"',
      '"PingFang SC"',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].filter(Boolean);

    return families.join(', ');
  }

  private buildFontFaceCss(font: FontFaceEntry) {
    const names = [font.family].concat(font.aliases || []).filter(Boolean);
    const format = this.detectFontFormat(font.mimeType, font.source);
    return [...new Set(names)].map((name) => `
      @font-face {
        font-family: "${this.escapeHtml(String(name))}";
        src: url("${this.escapeHtml(font.source)}")${format ? ` format("${format}")` : ''};
        font-display: block;
        font-style: normal;
        font-weight: 100 900;
      }
    `);
  }

  private detectDirection(layer: TextLayer): 'rtl' | 'ltr' {
    const explicit = String(layer.direction || layer.textDirection || '').toLowerCase();
    if (explicit === 'rtl' || explicit === 'ltr') return explicit;
    if (ARABIC_SCRIPT_RE.test(String(layer.text || ''))) return 'rtl';
    if (Array.isArray(layer.richText) && layer.richText.some((segment) => ARABIC_SCRIPT_RE.test(String(segment?.text || '')))) {
      return 'rtl';
    }
    return 'ltr';
  }

  private resolveLayerAlign(layer: NormalizedLayer) {
    if (layer.textAlign === 'justify' || (layer.direction === 'rtl' && layer.textAlign !== 'center')) {
      return 'justify';
    }
    return layer.textAlign || (layer.direction === 'rtl' ? 'justify' : 'left');
  }

  private resolveLineAlign(layer: NormalizedLayer, index: number, totalLines: number) {
    const useJustify = layer.textAlign === 'justify' || (layer.direction === 'rtl' && layer.textAlign !== 'center');
    if (!useJustify) return layer.textAlign || (layer.direction === 'rtl' ? 'right' : 'left');
    if (index === totalLines - 1) {
      return layer.direction === 'rtl' ? 'right' : 'left';
    }
    return 'justify';
  }

  private resolveLineAlignLast(layer: NormalizedLayer, index: number, totalLines: number) {
    const useJustify = layer.textAlign === 'justify' || (layer.direction === 'rtl' && layer.textAlign !== 'center');
    if (!useJustify) return 'auto';
    return index === totalLines - 1 ? (layer.direction === 'rtl' ? 'right' : 'left') : 'justify';
  }

  private async waitForFonts(page: any) {
    await page.evaluate(async () => {
      const waitWithTimeout = async (promise: Promise<unknown>, timeoutMs: number) => {
        await Promise.race([
          promise,
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      };

      if (document.fonts?.ready) {
        await waitWithTimeout(document.fonts.ready, 6000);
      }

      const nodes = Array.from(document.querySelectorAll<HTMLElement>('.text-layer'));
      await Promise.all(
        nodes.map((node) =>
          waitWithTimeout(
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

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  }

  private normalizeAssetUrl(url: string) {
    const base = (this.configService.get<string>('PUBLIC_BASE_URL') || this.configService.get<string>('SERVER_BASE_URL') || '').trim().replace(/\/+$/, '');
    if (!base) return url;
    return url.replace(/^https?:\/\/localhost:3000(?=\/|$)/i, base);
  }

  private async resolveFontSource(url: string) {
    if (!url || /^data:/i.test(url)) {
      return {
        source: url,
        mimeType: this.inferFontMimeType(url),
      };
    }

    const cacheKey = createHash('sha1').update(url).digest('hex');
    if (!this.fontDataUrlCache.has(cacheKey)) {
      this.fontDataUrlCache.set(cacheKey, this.fetchFontAsDataUrl(url));
    }
    return this.fontDataUrlCache.get(cacheKey)!;
  }

  private async fetchFontAsDataUrl(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`font fetch failed ${response.status} ${response.statusText}`);
    }

    const mimeType = this.inferFontMimeType(response.headers.get('content-type') || url);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      source: `data:${mimeType};base64,${base64}`,
      mimeType,
    };
  }

  private inferFontMimeType(value: string) {
    const input = String(value || '').toLowerCase();
    if (input.includes('woff2') || input.endsWith('.woff2')) return 'font/woff2';
    if (input.includes('woff') || input.endsWith('.woff')) return 'font/woff';
    if (input.includes('opentype') || input.endsWith('.otf')) return 'font/otf';
    if (input.includes('truetype') || input.endsWith('.ttf')) return 'font/ttf';
    return 'font/ttf';
  }

  private detectFontFormat(mimeType: string, source: string) {
    const input = `${mimeType || ''} ${source || ''}`.toLowerCase();
    if (input.includes('woff2')) return 'woff2';
    if (input.includes('woff')) return 'woff';
    if (input.includes('.otf') || input.includes('opentype')) return 'opentype';
    if (input.includes('.ttf') || input.includes('truetype')) return 'truetype';
    return '';
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
