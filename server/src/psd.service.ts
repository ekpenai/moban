import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { readPsd, initializeCanvas } from 'ag-psd';
import { createCanvas } from 'canvas';
import { v4 as uuidv4 } from 'uuid';

// 为 ag-psd 在 Node.js 环境下初始化 Canvas 支持
initializeCanvas(createCanvas as any);

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

@Injectable()
export class PsdService {
  private readonly logger = new Logger(PsdService.name);

  async parsePsd(filePath: string) {
    const buffer = fs.readFileSync(filePath);
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

            if (textStyle.fillColor) {
              const c = textStyle.fillColor as any;
              if (c.r !== undefined && c.g !== undefined && c.b !== undefined) {
                color = `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a ?? 1})`;
              } else if (c.fr !== undefined && c.fg !== undefined && c.fb !== undefined) {
                color = `rgba(${Math.round(c.fr)}, ${Math.round(c.fg)}, ${Math.round(c.fb)}, 1)`;
              } else {
                color = '#000000';
              }
            } else {
              color = '#000000';
            }

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
}
