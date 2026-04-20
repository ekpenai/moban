import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { readPsd, initializeCanvas } from 'ag-psd';
import { createCanvas } from 'canvas';
import { v4 as uuidv4 } from 'uuid';

// 为 ag-psd 在 Node.js 环境下初始化 Canvas 支持
initializeCanvas(createCanvas as any);

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
        
        // Very basic ag-psd text extraction logic
        if (layer.text) {
          type = 'text';
          text = layer.text.text;
          // ag-psd doesn't expose all font styles reliably without deeper parsing, we hardcode fallback for demo
          fontSize = 24; 
          color = '#000000';
        } else if (layer.canvas) {
          // In a real scenario we would upload this canvas dataUrl to OSS and get url.
          // For demo, we just convert to data base64.
          url = layer.canvas.toDataURL('image/png');
        }

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
          url,
          editable: true,
        });
      }
    }

    return template;
  }
}
