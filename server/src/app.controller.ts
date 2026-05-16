import { Controller, Get, Post, Param, Body, Delete, UseGuards, UseInterceptors, UploadedFile, Req, ServiceUnavailableException, BadRequestException, Res, UnauthorizedException } from '@nestjs/common';
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
import { SaveTemplateDto, RenderTemplateDto, FillTemplateDto } from './dto/template.dto';
import { UpdateProfileDto } from './dto/profile.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { SaveDraftDto, SaveFavoriteDto } from './dto/user-data.dto';
import { ArabicReshapeDto } from './dto/arabic-reshape.dto';
import { CreateRenderEventDto, ListRenderJobsDto } from './dto/render-job.dto';
import { WinstonLoggerService } from './logger.service';
import { WechatAuthService } from './wechat-auth.service';
import { UserDataService } from './user-data.service';
import { AuthGuard, type AuthenticatedRequestUser } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { ArabicReshapeService } from './arabic-reshape.service';
import { RenderJobService } from './render-job.service';
import * as fs from 'fs';
import * as path from 'path';
import type { Request } from 'express';
import type { Response } from 'express';

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
    private readonly wechatAuthService: WechatAuthService,
    private readonly userDataService: UserDataService,
    private readonly arabicReshapeService: ArabicReshapeService,
    private readonly renderJobService: RenderJobService,
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

  private extractFieldsFromLayers(layers: any[]) {
    const regex = /【(.*?)】/g;
    const fields = [];
    const fieldMap = new Map();

    for (const layer of layers) {
      if (layer.type === 'text' && layer.text) {
        let match;
        while ((match = regex.exec(layer.text)) !== null) {
          const raw = match[1];
          const parts = raw.split('|');
          const keyTypeStr = parts[0];
          const value = parts[1] || '';
          
          const [key, type] = keyTypeStr.split(':');
          
          let max = undefined;
          let autoScale = false;
          
          for (let i = 2; i < parts.length; i++) {
            if (parts[i].startsWith('max=')) {
              max = parseInt(parts[i].replace('max=', ''), 10);
            } else if (parts[i] === 'autoScale') {
              autoScale = true;
            }
          }

          const textBefore = layer.text.substring(0, match.index);
          const labelMatch = textBefore.match(/([^\s:：\n]+)[:：]?\s*$/);
          const label = labelMatch ? labelMatch[1] : key;

          if (!fieldMap.has(key)) {
            const fieldObj = {
              key,
              label,
              type: type || 'text',
              value: value,
              ...(max !== undefined && { max }),
              ...(autoScale && { autoScale })
            };
            fieldMap.set(key, fieldObj);
            fields.push(fieldObj);
          }
        }
      }
    }
    return fields;
  }

  private normalizeTemplateData(template: Template, req?: Request): any {
    const normalizedLayers = Array.isArray(template.layers)
      ? template.layers.map((layer: any) => ({
          ...layer,
          url: this.normalizeUploadUrl(layer?.url, req),
        }))
      : template.layers;

    const fields = this.extractFieldsFromLayers(normalizedLayers || []);

    return {
      ...template,
      thumbnail: this.normalizeUploadUrl(template.thumbnail, req) || '',
      layers: normalizedLayers as any,
      fields,
    };
  }

  @Post('templates/fill')
  async fillTemplateFields(@Body() body: FillTemplateDto, @Req() req: Request) {
    const { template, fieldsData } = body;
    if (!template || !template.layers) {
      throw new BadRequestException('Invalid template provided');
    }

    const newLayers = template.layers.map((layer: any) => {
      if (layer.type === 'text' && layer.text) {
        let newText = layer.text;
        const regex = /【(.*?)】/g;
        
        let match;
        // Check if we need autoScale
        let layerAutoScale = false;

        newText = newText.replace(regex, (_: string, raw: string) => {
          const parts = raw.split('|');
          const [key] = parts[0].split(':');
          
          let max = undefined;
          for (let i = 2; i < parts.length; i++) {
            if (parts[i].startsWith('max=')) {
              max = parseInt(parts[i].replace('max=', ''), 10);
            } else if (parts[i] === 'autoScale') {
              layerAutoScale = true;
            }
          }

          let val = fieldsData[key] !== undefined ? String(fieldsData[key]) : (parts[1] || '');
          if (max !== undefined && val.length > max) {
            val = val.substring(0, max);
          }
          return val;
        });

        return {
          ...layer,
          text: newText,
          autoScale: layerAutoScale || layer.autoScale
        };
      }
      return layer;
    });

    return {
      data: {
        ...template,
        layers: newLayers
      }
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

  @Post('auth/wechat-login')
  async wechatLogin(@Body() body: WechatLoginDto) {
    return this.wechatAuthService.login(body);
  }

  @Post('api/arabic/reshape')
  async reshapeArabic(@Body() body: ArabicReshapeDto) {
    return this.arabicReshapeService.reshapeText(body.text, body.mode);
  }

  @Get('me/profile')
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.wechatAuthService.getProfile(user.userId);
  }

  @Post('me/profile')
  @UseGuards(AuthGuard)
  async updateProfile(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: UpdateProfileDto) {
    return this.wechatAuthService.updateProfile(user.userId, body);
  }

  @Get('me/favorites')
  @UseGuards(AuthGuard)
  async listFavorites(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.userDataService.listFavorites(user.userId);
  }

  @Post('me/favorites')
  @UseGuards(AuthGuard)
  async saveFavorite(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: SaveFavoriteDto) {
    return this.userDataService.saveFavorite(user.userId, body);
  }

  @Delete('me/favorites/:templateId')
  @UseGuards(AuthGuard)
  async deleteFavorite(@CurrentUser() user: AuthenticatedRequestUser, @Param('templateId') templateId: string) {
    return this.userDataService.deleteFavorite(user.userId, templateId);
  }

  @Get('me/drafts')
  @UseGuards(AuthGuard)
  async listDrafts(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.userDataService.listDrafts(user.userId);
  }

  @Post('me/drafts')
  @UseGuards(AuthGuard)
  async saveDraft(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: SaveDraftDto) {
    return this.userDataService.saveDraft(user.userId, body);
  }

  @Delete('me/drafts/:id')
  @UseGuards(AuthGuard)
  async deleteDraft(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.userDataService.deleteDraft(user.userId, id);
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

  @Get('templates/:id/replace-layer')
  async getTemplateReplaceLayer(@Param('id') id: string, @Req() req: Request) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      return { data: null, message: 'Template not found' };
    }
    const layers = Array.isArray(template.layers) ? template.layers : [];
    // 查找名为“替换”的图层，如果没有则查找包含“替换”的图层，优先全匹配
    let replaceLayer = layers.find((l: any) => l.name === '替换');
    if (!replaceLayer) {
      replaceLayer = layers.find((l: any) => l.name && l.name.includes('替换'));
    }
    
    if (!replaceLayer) {
      return { data: null, message: '未找到名称为“替换”的图层' };
    }
    
    return {
      data: {
        id: replaceLayer.id,
        name: replaceLayer.name,
        x: replaceLayer.maskRect ? replaceLayer.maskRect.x : replaceLayer.x,
        y: replaceLayer.maskRect ? replaceLayer.maskRect.y : replaceLayer.y,
        width: replaceLayer.maskRect ? replaceLayer.maskRect.width : replaceLayer.width,
        height: replaceLayer.maskRect ? replaceLayer.maskRect.height : replaceLayer.height,
        url: this.normalizeUploadUrl(replaceLayer.maskUrl || replaceLayer.url, req),
        type: replaceLayer.type,
      }
    };
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
  @UseGuards(AuthGuard)
  async renderTemplate(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: RenderTemplateDto, @Req() req: Request) {
    this.logger.log(`Received render request for template`);
    if (!body?.template || !Array.isArray(body.template.layers)) {
      throw new BadRequestException('template.layers is required');
    }
    try {
      const sourceHeader = String(req.headers['x-render-source'] || '').trim().toLowerCase();
      const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
      const source = sourceHeader === 'mini_program' || userAgent.includes('miniprogram') || userAgent.includes('micromessenger')
        ? 'mini_program'
        : 'web';
      const enqueuePromise = this.renderQueue.add('render-job', {
        template: body.template,
        userId: user.userId,
        source,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      });

      // Keep the submission endpoint fast for mobile clients.
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('enqueue_timeout')), 1800);
      });

      const job = await Promise.race([enqueuePromise, timeoutPromise]);

      this.logger.log(`Job ${job.id} added successfully.`);
      return {
        jobId: String(job.id),
        status: 'queued',
      };
    } catch (err) {
      this.logger.error('Failed to add job to Redis', err.stack);
      if ((err as Error)?.message === 'enqueue_timeout') {
        throw new ServiceUnavailableException('render queue unavailable');
      }
      throw new ServiceUnavailableException('failed to submit render job');
    }
  }

  @Get('render/:jobId')
  @UseGuards(AuthGuard)
  async getRenderStatus(@CurrentUser() user: AuthenticatedRequestUser, @Param('jobId') jobId: string) {
    const ownedJob = await this.renderJobService.getJobForUser(jobId, user.userId);
    const job = await this.renderQueue.getJob(jobId);
    if (!job) {
      return {
        jobId,
        status: 'failed',
        stage: ownedJob.stage || 'failed',
        progress: ownedJob.progress || 0,
        message: ownedJob.failedReason || ownedJob.message || 'job not found or expired',
        updatedAt: ownedJob.updatedAt?.toISOString?.() || null,
        durationMs: ownedJob.startedAt ? Math.max(0, (ownedJob.completedAt || ownedJob.updatedAt).getTime() - ownedJob.startedAt.getTime()) : null,
      };
    }

    const state = await job.getState();
    const progressValue = job.progress();
    const progress =
      typeof progressValue === 'number'
        ? progressValue
        : typeof progressValue === 'object' && typeof (progressValue as any)?.percent === 'number'
          ? (progressValue as any).percent
          : state === 'completed'
            ? 100
            : state === 'active'
              ? 1
              : 0;

    if (state === 'completed') {
      const returnValue = job.returnvalue;
      const imageUrl = returnValue?.imageUrl || job.data?.uploadedImageUrl;
      let imageBase64 = returnValue?.imageBase64;

      if (!imageUrl && typeof returnValue === 'string' && returnValue.startsWith('data:image/')) {
        imageBase64 = returnValue;
      }

      const detail = await this.renderJobService.getJobDetailForUser(jobId, user.userId);
      return {
        jobId,
        status: 'completed',
        progress: 100,
        stage: detail.stage || 'completed',
        message: detail.message,
        imageUrl,
        result: !imageUrl ? imageBase64 : undefined,
        updatedAt: detail.updatedAt,
        durationMs: detail.durationMs,
        recentLogs: detail.recentLogs,
      };
    }

    if (state === 'failed') {
      const detail = await this.renderJobService.getJobDetailForUser(jobId, user.userId);
      return {
        jobId,
        status: 'failed',
        progress,
        stage: detail.stage || 'failed',
        message: detail.failedReason || detail.message || String(job.failedReason || 'render failed'),
        updatedAt: detail.updatedAt,
        durationMs: detail.durationMs,
        recentLogs: detail.recentLogs,
      };
    }

    const normalizedStatus =
      state === 'active'
        ? 'processing'
        : state === 'waiting' || state === 'delayed' || state === 'paused'
          ? 'queued'
          : state;

    const detail = await this.renderJobService.getJobDetailForUser(jobId, user.userId);
    return {
      jobId,
      status: normalizedStatus,
      progress,
      stage: detail.stage || normalizedStatus,
      message: detail.message,
      updatedAt: detail.updatedAt,
      durationMs: detail.durationMs,
      recentLogs: detail.recentLogs,
    };
  }

  @Get('me/render-jobs')
  @UseGuards(AuthGuard)
  async listRenderJobs(@CurrentUser() user: AuthenticatedRequestUser, @Req() req: Request) {
    const query = req.query as unknown as ListRenderJobsDto;
    return {
      success: true,
      data: await this.renderJobService.listJobsForUser(user.userId, query),
    };
  }

  @Get('me/render-jobs/:jobId')
  @UseGuards(AuthGuard)
  async getRenderJobDetail(@CurrentUser() user: AuthenticatedRequestUser, @Param('jobId') jobId: string) {
    return {
      success: true,
      data: await this.renderJobService.getJobDetailForUser(jobId, user.userId),
    };
  }

  @Get('me/render-jobs/:jobId/logs')
  @UseGuards(AuthGuard)
  async getRenderJobLogs(@CurrentUser() user: AuthenticatedRequestUser, @Param('jobId') jobId: string) {
    return {
      success: true,
      data: await this.renderJobService.getJobLogsForUser(jobId, user.userId),
    };
  }

  @Get('me/render-jobs/:jobId/stream')
  @UseGuards(AuthGuard)
  async streamRenderJob(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    await this.renderJobService.getJobForUser(jobId, user.userId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, payload: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeEvent('snapshot', await this.renderJobService.getJobDetailForUser(jobId, user.userId));
    writeEvent('logs', await this.renderJobService.getJobLogsForUser(jobId, user.userId));

    const unsubscribe = this.renderJobService.subscribe(jobId, (event) => {
      writeEvent(event.type, event.payload);
    });

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  }

  @Post('internal/render-jobs/:jobId/events')
  async recordRenderJobEvent(@Param('jobId') jobId: string, @Body() body: CreateRenderEventDto, @Req() req: Request) {
    const internalToken = (process.env.WORKER_INTERNAL_TOKEN || '').trim();
    if (internalToken) {
      const authorization = String(req.headers.authorization || '');
      const expected = `Bearer ${internalToken}`;
      if (authorization !== expected) {
        throw new UnauthorizedException({ success: false, message: 'invalid worker token' });
      }
    }

    await this.renderJobService.recordEvent({
      jobId,
      userId: body.userId,
      status: body.status,
      stage: body.stage,
      progress: typeof body.progress === 'number' ? body.progress : undefined,
      message: body.message,
      level: body.level,
      imageUrl: body.imageUrl,
      failedReason: body.failedReason,
      startedAt: body.startedAt,
      completedAt: body.completedAt,
      meta: body.meta,
    });

    return { success: true };
  }
}




