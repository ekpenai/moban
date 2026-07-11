import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { readPsd, initializeCanvas } from 'ag-psd';
import { createCanvas, ImageData } from 'canvas';
import { v4 as uuidv4 } from 'uuid';

initializeCanvas(createCanvas as any);

const CMYK_COLOR_MODE = 4;

function isReplaceLayerName(name?: string): boolean {
  return !!name && name.includes('替换');
}

function buildBlackWhiteMask(layerMaskCanvas: any) {
  const width = layerMaskCanvas.width;
  const height = layerMaskCanvas.height;
  const output = createCanvas(width, height);
  const ctx = output.getContext('2d');
  const sourceCtx = layerMaskCanvas.getContext('2d');
  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] || 0;
    const visible = alpha > 0;
    const value = visible ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return output.toDataURL('image/png');
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function cmykToRgb(values: number[]): [number, number, number] {
  const c = Math.max(0, Math.min(1, values[0] ?? 0));
  const m = Math.max(0, Math.min(1, values[1] ?? 0));
  const y = Math.max(0, Math.min(1, values[2] ?? 0));
  const k = Math.max(0, Math.min(1, values[3] ?? 0));

  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);

  return [clampColorChannel(r), clampColorChannel(g), clampColorChannel(b)];
}

function rgbObjectToCss(color: any): string {
  if (color?.r !== undefined && color?.g !== undefined && color?.b !== undefined) {
    return `rgba(${clampColorChannel(color.r)}, ${clampColorChannel(color.g)}, ${clampColorChannel(color.b)}, ${color.a ?? 1})`;
  }

  if (color?.fr !== undefined && color?.fg !== undefined && color?.fb !== undefined) {
    return `rgba(${clampColorChannel(color.fr)}, ${clampColorChannel(color.fg)}, ${clampColorChannel(color.fb)}, 1)`;
  }

  return '#000000';
}

function engineColorToCss(fillColor: any): string {
  if (!fillColor || !Array.isArray(fillColor.Values)) {
    return '#000000';
  }

  const values = fillColor.Values.slice(1);
  if (fillColor.Type === 1) {
    const [r = 0, g = 0, b = 0] = values;
    return `rgba(${clampColorChannel(r * 255)}, ${clampColorChannel(g * 255)}, ${clampColorChannel(b * 255)}, 1)`;
  }

  if (fillColor.Type === 2) {
    const [c = 0, m = 0, y = 0, k = 0] = values;
    const [r, g, b] = cmykToRgb([c, m, y, k]);
    return `rgba(${r}, ${g}, ${b}, 1)`;
  }

  return '#000000';
}

function mapJustification(value: unknown): string {
  switch (value) {
    case 1:
      return 'center';
    case 2:
      return 'right';
    case 3:
      return 'justify';
    default:
      return 'left';
  }
}

@Injectable()
export class PsdService {
  private readonly logger = new Logger(PsdService.name);

  async parsePsd(filePath: string) {
    const buffer = fs.readFileSync(filePath);

    try {
      return this.parseWithAgPsd(buffer);
    } catch (error) {
      if (this.shouldFallbackToWebtoon(error)) {
        this.logger.warn(`[psd] ag-psd fallback for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        return this.parseWithWebtoon(buffer);
      }
      throw error;
    }
  }

  private parseWithAgPsd(buffer: Buffer) {
    const psd = readPsd(buffer);

    const template = {
      width: psd.width,
      height: psd.height,
      layers: [] as any[],
    };

    if (psd.children) {
      for (const layer of psd.children) {
        if (layer.hidden) continue;

        let type = 'image';
        let text = undefined;
        let fontSize = undefined;
        let color = undefined;
        let url = undefined;
        let fontFamily = undefined;
        let textAlign = undefined;
        let direction = undefined;

        if (layer.text) {
          type = 'text';
          text = layer.text.text;

          const textStyle = layer.text.style || (layer.text.styleRuns && layer.text.styleRuns[0] ? layer.text.styleRuns[0].style : null);
          const paragraphStyle = layer.text.paragraphStyle || (layer.text.paragraphStyleRuns && layer.text.paragraphStyleRuns[0] ? layer.text.paragraphStyleRuns[0].style : null);

          if (textStyle) {
            const scaleY = layer.text.transform && layer.text.transform.length >= 4 ? layer.text.transform[3] : 1;
            fontSize = textStyle.fontSize ? Math.round(textStyle.fontSize * scaleY) : 24;
            fontFamily = textStyle.font ? textStyle.font.name : 'Arial';
            color = textStyle.fillColor ? rgbObjectToCss(textStyle.fillColor) : '#000000';
            direction = textStyle.characterDirection === 1 ? 'rtl' : 'ltr';
          } else {
            fontSize = 24;
            color = '#000000';
            fontFamily = 'Arial';
            direction = 'ltr';
          }

          if (paragraphStyle) {
            textAlign = paragraphStyle.justification || 'left';
            if (textAlign.startsWith('justify')) textAlign = 'justify';
          } else {
            textAlign = 'left';
          }
        } else if (layer.canvas) {
          url = layer.canvas.toDataURL('image/png');
        }

        let maskUrl = undefined;
        let maskRect = undefined;
        if (layer.mask && layer.mask.canvas) {
          maskRect = {
            x: layer.mask.left || 0,
            y: layer.mask.top || 0,
            width: (layer.mask.right !== undefined && layer.mask.left !== undefined) ? (layer.mask.right - layer.mask.left) : layer.mask.canvas.width,
            height: (layer.mask.bottom !== undefined && layer.mask.top !== undefined) ? (layer.mask.bottom - layer.mask.top) : layer.mask.canvas.height,
          };
          maskUrl = isReplaceLayerName(layer.name)
            ? buildBlackWhiteMask(layer.mask.canvas)
            : layer.mask.canvas.toDataURL('image/png');
        }

        const isReplaceable = isReplaceLayerName(layer.name);

        template.layers.push({
          id: uuidv4(),
          name: layer.name,
          type,
          x: layer.left || 0,
          y: layer.top || 0,
          width: (layer.right !== undefined && layer.left !== undefined) ? (layer.right - layer.left) : psd.width,
          height: (layer.bottom !== undefined && layer.top !== undefined) ? (layer.bottom - layer.top) : psd.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          text,
          fontSize,
          color,
          fontFamily,
          textAlign,
          direction,
          url,
          maskUrl,
          maskRect,
          isReplaceable,
          editable: true,
        });
      }
    }

    return template;
  }

  private shouldFallbackToWebtoon(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Color mode not supported');
  }

  private async parseWithWebtoon(buffer: Buffer) {
    const { default: WebtoonPsd, ColorMode } = await import('@webtoon/psd');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const psd = WebtoonPsd.parse(arrayBuffer);

    if (psd.colorMode !== ColorMode.Rgb && psd.colorMode !== CMYK_COLOR_MODE) {
      throw new Error(`PSD color mode not supported: ${psd.colorMode}`);
    }

    const template = {
      width: psd.width,
      height: psd.height,
      layers: [] as any[],
    };

    for (const layer of psd.layers) {
      if (layer.isHidden) continue;

      const styleSheet = layer.textProperties?.EngineDict?.StyleRun?.RunArray?.[0]?.StyleSheet?.StyleSheetData
        || layer.textProperties?.ResourceDict?.StyleSheetSet?.[0]?.StyleSheetData
        || layer.textProperties?.DocumentResources?.StyleSheetSet?.[0]?.StyleSheetData
        || {};
      const paragraphProperties = layer.textProperties?.EngineDict?.ParagraphRun?.RunArray?.[0]?.ParagraphSheet?.Properties
        || layer.textProperties?.ResourceDict?.ParagraphSheetSet?.[0]?.Properties
        || layer.textProperties?.DocumentResources?.ParagraphSheetSet?.[0]?.Properties
        || {};

      const text = typeof layer.text === 'string' ? layer.text.replace(/\r/g, '\n').trimEnd() : undefined;
      const type = text ? 'text' : 'image';
      const imageUrl = await this.compositeWebtoonLayerToDataUrl(layer);
      const isReplaceable = isReplaceLayerName(layer.name);

      template.layers.push({
        id: uuidv4(),
        name: layer.name,
        type,
        x: layer.left,
        y: layer.top,
        width: layer.width,
        height: layer.height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        text,
        fontSize: text ? Math.max(12, Math.round(styleSheet.FontSize || 24)) : undefined,
        color: text ? engineColorToCss(styleSheet.FillColor) : undefined,
        fontFamily: text ? (layer.textProperties?.DocumentResources?.FontSet?.[styleSheet.Font]?.Name || 'Arial') : undefined,
        textAlign: text ? mapJustification(paragraphProperties.Justification) : undefined,
        direction: text ? (styleSheet.CharacterDirection === 1 ? 'rtl' : 'ltr') : undefined,
        url: imageUrl,
        maskUrl: undefined,
        maskRect: undefined,
        isReplaceable,
        editable: true,
      });
    }

    return template;
  }

  private async compositeWebtoonLayerToDataUrl(layer: any): Promise<string | undefined> {
    if (!layer.width || !layer.height) {
      return undefined;
    }

    const pixels = await layer.composite();
    const canvas = createCanvas(layer.width, layer.height);
    const ctx = canvas.getContext('2d');
    const imageData = new ImageData(pixels, layer.width, layer.height);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }
}
