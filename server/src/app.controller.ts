import { Controller, Get, Post, Param, Body, Delete, UseInterceptors, UploadedFile, Req, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PsdService } from './psd.service';
import { S3Service } from './s3.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { Setting } from './setting.entity';
import { SaveTemplateDto, RenderTemplateDto } from './dto/template.dto';
import { WinstonLoggerService } from './logger.service';
import * as fs from 'fs';
import * as path from 'path';
import type { Request } from 'express';

function parseSizeToBytes(input: string | undefined, fallbackBytes: number): number {
  if (!input) return fallbackBytes;
  const s = String(input).trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib)?$/);
  if (!m) return fallbackBytes;
  const value = Number(m[1]);
  const unit = m[2] || 'b';
  const factor =
    unit === 'kb' || unit === 'kib' ? 1024 :
    unit === 'mb' || unit === 'mib' ? 1024 * 1024 :
    unit === 'gb' || unit === 'gib' ? 1024 * 1024 * 1024 : 1;
  return Math.max(1, Math.floor(value * factor));
}

const PSD_UPLOAD_LIMIT_BYTES = parseSizeToBytes(process.env.PSD_UPLOAD_LIMIT || '300mb', 300 * 1024 * 1024);

@Controller()
export class AppController {
  constructor(
    private readonly psdService: PsdService,
    private readonly s3Service: S3Service,
    @InjectQueue('renderQueue') private renderQueue: Queue,
    @InjectRepository(Template) private templateRepo: Repository<Template>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
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

  private toPublicUploadUrl(filename: string, req?: Request, folder: string = 'uploads'): string {
    return `${this.getPublicBaseUrl(req)}/${folder}/${filename}`;
  }

  private normalizeUploadUrl(url?: string, req?: Request): string | undefined {
    if (!url || typeof url !== 'string') return url;
    // 兼容 uploads 和 images 路径
    return url
      .replace(/^https?:\/\/localhost:3000\/uploads\//i, `${this.getPublicBaseUrl(req)}/uploads/`)
      .replace(/^https?:\/\/localhost:3000\/images\//i, `${this.getPublicBaseUrl(req)}/images/`);
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
  @UseInterceptors(FileInterceptor('file', { dest: './uploads', limits: { fileSize: PSD_UPLOAD_LIMIT_BYTES } }))
  async uploadPsd(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('未接收到 PSD 文件，或文件超过上传上限');
    }
    const result = await this.psdService.parsePsd(file.path);
    return { data: result };
  }

  @Post('upload/image')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.s3Service.uploadFile(file.buffer, file.originalname, file.mimetype, 'images');
    return { url };
  }

  @Post('upload/sys-image')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadSysImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.s3Service.uploadFile(file.buffer, file.originalname, file.mimetype, 'sys-images');
    return { url };
  }

  @Get('settings/:key')
  async getSetting(@Param('key') key: string) {
    const setting = await this.settingRepo.findOne({ where: { key } });
    return { data: setting ? setting.value : null };
  }

  @Post('settings/:key')
  async saveSetting(@Param('key') key: string, @Body() body: any) {
    let setting = await this.settingRepo.findOne({ where: { key } });
    if (!setting) {
      setting = this.settingRepo.create({ key, value: body.value });
    } else {
      setting.value = body.value;
    }
    await this.settingRepo.save(setting);
    return { success: true, data: setting.value };
  }

  @Post('templates/save')
  async saveTemplate(@Body() body: SaveTemplateDto, @Req() req: Request) {
    this.logger.log(`Incoming save request: name=${body.name}, category=${body.category}, thumb=${body.thumbnail?.substring(0, 50)}...`);
    let thumbnailPath = body.thumbnail;

    // 处理 Base64 缩略图
    if (body.thumbnail && body.thumbnail.startsWith('data:image')) {
      try {
        thumbnailPath = await this.s3Service.uploadBase64(body.thumbnail, 'images');
      } catch (err) {
        this.logger.error('Failed to upload thumbnail to S3', err);
        throw new BadRequestException('上传缩略图失败');
      }
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
    this.logger.log(`Template saved successfully: id=${saved.id}, thumbnail=${saved.thumbnail}`);
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
    const template = await this.templateRepo.findOne({ where: { id } });
    if (template && template.thumbnail) {
      await this.deletePhysicalFile(template.thumbnail);
    }
    await this.templateRepo.delete(id);
    return { success: true };
  }

  private async deletePhysicalFile(thumbnailUrl: string) {
    try {
      if (thumbnailUrl.includes('objectstorageapi') || thumbnailUrl.includes('sealosbja.site') || thumbnailUrl.includes('sealos.run')) {
        await this.s3Service.deleteFile(thumbnailUrl);
        return;
      }

      // 提取文件名
      // URL 格式通常为: http://host:port/images/img-xxx.png
      const parts = thumbnailUrl.split('/');
      const filename = parts[parts.length - 1];
      if (!filename) return;

      const filePath = path.join(process.cwd(), '..', 'images', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted physical file: ${filePath}`);
      }
    } catch (err) {
      this.logger.error(`Failed to delete physical file: ${thumbnailUrl}`, err.stack);
    }
  }

  @Post('templates/batch-delete')
  async batchDeleteTemplates(@Body('ids') ids: string[]) {
    if (!ids || ids.length === 0) return { success: true };
    
    // 获取待删除模板的所有详情
    const templates = await this.templateRepo.findByIds(ids);
    for (const template of templates) {
      if (template.thumbnail) {
        await this.deletePhysicalFile(template.thumbnail);
      }
    }

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
