import { Controller, Get, Post, Param, Body, Delete, UseInterceptors, UploadedFile, Req, ServiceUnavailableException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PsdService } from './psd.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { SaveTemplateDto, RenderTemplateDto } from './dto/template.dto';
import { WinstonLoggerService } from './logger.service';
import * as fs from 'fs';
import * as path from 'path';
import type { Request } from 'express';

@Controller()
export class AppController {
  constructor(
    private readonly psdService: PsdService,
    @InjectQueue('renderQueue') private renderQueue: Queue,
    @InjectRepository(Template) private templateRepo: Repository<Template>,
    private readonly logger: WinstonLoggerService,
  ) {}

  private getPublicBaseUrl(req?: Request): string {
    const envBase = (process.env.PUBLIC_BASE_URL || '').trim();
    if (envBase) {
      return envBase.replace(/\/+$/, '');
    }
    const protoHeader = (req?.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
    const hostHeader = (req?.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
    const host = hostHeader || req?.get('host') || `localhost:${process.env.PORT || 3000}`;
    const proto = protoHeader || req?.protocol || 'http';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  private toPublicUploadUrl(filename: string, req?: Request): string {
    return `${this.getPublicBaseUrl(req)}/uploads/${filename}`;
  }

  private normalizeUploadUrl(url?: string, req?: Request): string | undefined {
    if (!url || typeof url !== 'string') return url;
    return url.replace(/^https?:\/\/localhost:3000\/uploads\//i, `${this.getPublicBaseUrl(req)}/uploads/`);
  }

  private normalizeTemplateData(template: Template, req?: Request): Template {
    const normalizedLayers = Array.isArray(template.layers)
      ? template.layers.map((layer: any) => ({
          ...layer,
          url: this.normalizeUploadUrl(layer?.url, req),
        }))
      : template.layers;

    return {
      ...template,
      thumbnail: this.normalizeUploadUrl(template.thumbnail, req) || '',
      layers: normalizedLayers as any,
    };
  }

  @Post('upload/psd')
  @UseInterceptors(FileInterceptor('file', { dest: './uploads' }))
  async uploadPsd(@UploadedFile() file: Express.Multer.File) {
    const result = await this.psdService.parsePsd(file.path);
    return { data: result };
  }

  @Post('upload/image')
  @UseInterceptors(FileInterceptor('file', { dest: './uploads' }))
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    const url = this.toPublicUploadUrl(file.filename, req);
    return { url };
  }

  @Post('templates/save')
  async saveTemplate(@Body() body: SaveTemplateDto, @Req() req: Request) {
    let thumbnailPath = body.thumbnail;

    // 处理 Base64 缩略图
    if (body.thumbnail && body.thumbnail.startsWith('data:image')) {
      const base64Data = body.thumbnail.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `thumb-${Date.now()}.png`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      
      this.logger.log(`Saving thumbnail to: ${path.join(uploadDir, filename)}`);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      fs.writeFileSync(path.join(uploadDir, filename), buffer);
      thumbnailPath = this.toPublicUploadUrl(filename, req);
    }

    const template = this.templateRepo.create({
      id: body.id,
      name: body.name,
      width: body.width,
      height: body.height,
      layers: body.layers,
      thumbnail: thumbnailPath,
      category: body.category || '未分类'
    });
    const saved = await this.templateRepo.save(template);
    return { data: this.normalizeTemplateData(saved, req) };
  }

  @Get('templates')
  async listTemplates(@Req() req: Request) {
    const list = await this.templateRepo.find({ 
      select: ['id', 'name', 'width', 'height', 'createdAt', 'thumbnail', 'category'],
      order: { createdAt: 'DESC' } 
    });
    return { data: list.map((item) => this.normalizeTemplateData(item, req)) };
  }

  @Get('templates/:id')
  async getTemplateDetail(@Param('id') id: string, @Req() req: Request) {
    const template = await this.templateRepo.findOne({ where: { id } });
    return { data: template ? this.normalizeTemplateData(template, req) : null };
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    await this.templateRepo.delete(id);
    return { success: true };
  }

  @Post('templates/batch-delete')
  async batchDeleteTemplates(@Body('ids') ids: string[]) {
    if (!ids || ids.length === 0) return { success: true };
    await this.templateRepo.delete(ids);
    return { success: true };
  }

  @Post('render')
  async renderTemplate(@Body() body: RenderTemplateDto) {
    this.logger.log(`Received render request for template`);
    try {
      const enqueuePromise = this.renderQueue.add('render-job', {
        template: body.template,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      });

      // Avoid hanging forever when Redis is temporarily unreachable.
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('enqueue_timeout')), 12000);
      });

      const job = await Promise.race([enqueuePromise, timeoutPromise]);
      
      const counts = await this.renderQueue.getJobCounts();
      this.logger.log(`Job ${job.id} added successfully. Queue status: ${JSON.stringify(counts)}`);
      return { jobId: job.id };
    } catch (err) {
      this.logger.error('Failed to add job to Redis', err.stack);
      if ((err as Error)?.message === 'enqueue_timeout') {
        throw new ServiceUnavailableException('渲染队列暂时不可用，请稍后重试');
      }
      throw new ServiceUnavailableException('渲染任务提交失败，请稍后重试');
    }
  }

  @Get('render/:jobId')
  async getRenderStatus(@Param('jobId') jobId: string) {
    const job = await this.renderQueue.getJob(jobId);
    if (!job) {
      return { status: 'not_found' };
    }
    const state = await job.getState();
    const result = job.returnvalue;
    return {
      status: state,
      result,
      failedReason: state === 'failed' ? String(job.failedReason || '') : undefined,
    };
  }
}
