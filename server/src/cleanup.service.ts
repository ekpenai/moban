import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private configService: ConfigService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleCleanup() {
    this.logger.log('Starting cleanup of old rendering files...');
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const daysLimit = this.configService.get<number>('CLEANUP_DAYS_LIMIT', 7);
    const msLimit = daysLimit * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (!fs.existsSync(uploadsPath)) return;

    const files = fs.readdirSync(uploadsPath);
    let deletedCount = 0;

    files.forEach((file) => {
      // 仅清理 render- 开头的图片
      if (!file.startsWith('render-')) return;

      const filePath = path.join(uploadsPath, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > msLimit) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    this.logger.log(`Cleanup finished. Deleted ${deletedCount} files.`);
  }
}
