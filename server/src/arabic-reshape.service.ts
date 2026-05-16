import { BadRequestException, Injectable } from '@nestjs/common';
import reshaper from 'arabic-persian-reshaper';

type ReshapeMode = 'arabic' | 'persian';

@Injectable()
export class ArabicReshapeService {
  reshapeText(text: string, mode: ReshapeMode = 'arabic') {
    if (typeof text !== 'string') {
      throw new BadRequestException({
        success: false,
        message: 'text must be a string',
      });
    }

    try {
      const normalizedMode = mode === 'persian' ? 'persian' : 'arabic';
      const shaper =
        normalizedMode === 'persian'
          ? reshaper.PersianShaper
          : reshaper.ArabicShaper;

      return {
        success: true as const,
        original: text,
        reshaped: shaper.convertArabic(text),
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error instanceof Error ? error.message : 'reshape failed',
      });
    }
  }
}
