import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RenderJobEntity } from './render-job.entity';
import { RenderJobLogEntity } from './render-job-log.entity';
import { ListRenderJobsDto } from './dto/render-job.dto';

type RenderJobUpdate = {
  status?: string;
  stage?: string;
  progress?: number;
  message?: string;
  imageUrl?: string | null;
  failedReason?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

type RenderJobLogInput = {
  jobId: string;
  userId: string;
  stage: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown> | null;
};

type StreamEvent =
  | { type: 'snapshot'; payload: unknown }
  | { type: 'log'; payload: unknown };

@Injectable()
export class RenderJobService {
  private readonly streamListeners = new Map<string, Set<(event: StreamEvent) => void>>();

  constructor(
    @InjectRepository(RenderJobEntity)
    private readonly renderJobRepo: Repository<RenderJobEntity>,
    @InjectRepository(RenderJobLogEntity)
    private readonly renderJobLogRepo: Repository<RenderJobLogEntity>,
  ) {}

  async createJob(input: {
    jobId: string;
    userId: string;
    source: string;
    status: string;
    stage: string;
    progress: number;
    message: string;
  }) {
    const entity = this.renderJobRepo.create({
      jobId: input.jobId,
      userId: input.userId,
      source: input.source,
      status: input.status,
      stage: input.stage,
      progress: input.progress,
      message: input.message,
      startedAt: null,
      completedAt: null,
      imageUrl: null,
      failedReason: null,
    });
    await this.renderJobRepo.save(entity);
    await this.appendLog({
      jobId: input.jobId,
      userId: input.userId,
      stage: input.stage,
      level: 'info',
      message: input.message,
      meta: { source: input.source, status: input.status, progress: input.progress },
    });
    return entity;
  }

  async getJobForUser(jobId: string, userId: string) {
    const entity = await this.renderJobRepo.findOne({ where: { jobId } });
    if (!entity) {
      throw new NotFoundException({ success: false, message: 'render job not found' });
    }
    if (entity.userId !== userId) {
      throw new UnauthorizedException({ success: false, message: 'no access to this render job' });
    }
    return entity;
  }

  async updateJob(jobId: string, patch: RenderJobUpdate) {
    const entity = await this.renderJobRepo.findOne({ where: { jobId } });
    if (!entity) return null;

    if (patch.status !== undefined) entity.status = patch.status;
    if (patch.stage !== undefined) entity.stage = patch.stage;
    if (patch.progress !== undefined) entity.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    if (patch.message !== undefined) entity.message = patch.message;
    if (patch.imageUrl !== undefined) entity.imageUrl = patch.imageUrl;
    if (patch.failedReason !== undefined) entity.failedReason = patch.failedReason;
    if (patch.startedAt !== undefined) entity.startedAt = patch.startedAt;
    if (patch.completedAt !== undefined) entity.completedAt = patch.completedAt;

    const saved = await this.renderJobRepo.save(entity);
    await this.emitSnapshot(saved.jobId);
    return saved;
  }

  async appendLog(input: RenderJobLogInput) {
    const log = this.renderJobLogRepo.create({
      jobId: input.jobId,
      userId: input.userId,
      stage: input.stage,
      level: input.level,
      message: input.message,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    });
    const saved = await this.renderJobLogRepo.save(log);
    this.emit(input.jobId, {
      type: 'log',
      payload: this.serializeLog(saved),
    });
    return saved;
  }

  async recordEvent(input: {
    jobId: string;
    userId: string;
    status?: string;
    stage: string;
    progress?: number;
    message: string;
    level: 'info' | 'warn' | 'error';
    imageUrl?: string | null;
    failedReason?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    meta?: Record<string, unknown> | null;
  }) {
    const startedAt = input.startedAt ? new Date(input.startedAt) : undefined;
    const completedAt = input.completedAt ? new Date(input.completedAt) : undefined;

    await this.updateJob(input.jobId, {
      status: input.status,
      stage: input.stage,
      progress: input.progress,
      message: input.message,
      imageUrl: input.imageUrl,
      failedReason: input.failedReason,
      startedAt,
      completedAt,
    });

    await this.appendLog({
      jobId: input.jobId,
      userId: input.userId,
      stage: input.stage,
      level: input.level,
      message: input.message,
      meta: input.meta || null,
    });
  }

  async listJobsForUser(userId: string, query: ListRenderJobsDto) {
    const qb = this.renderJobRepo.createQueryBuilder('job')
      .where('job.userId = :userId', { userId });

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }
    if (query.source) {
      qb.andWhere('job.source = :source', { source: query.source });
    }

    qb.orderBy('job.createdAt', 'DESC').limit(50);
    const jobs = await qb.getMany();
    return Promise.all(jobs.map((job) => this.serializeJobWithRecentLogs(job)));
  }

  async getJobDetailForUser(jobId: string, userId: string) {
    const job = await this.getJobForUser(jobId, userId);
    return this.serializeJobWithRecentLogs(job);
  }

  async getJobLogsForUser(jobId: string, userId: string) {
    await this.getJobForUser(jobId, userId);
    const logs = await this.renderJobLogRepo.find({
      where: { jobId, userId },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    return logs.map((log) => this.serializeLog(log));
  }

  subscribe(jobId: string, listener: (event: StreamEvent) => void) {
    const set = this.streamListeners.get(jobId) || new Set();
    set.add(listener);
    this.streamListeners.set(jobId, set);
    return () => {
      const current = this.streamListeners.get(jobId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.streamListeners.delete(jobId);
      }
    };
  }

  async emitSnapshot(jobId: string) {
    const job = await this.renderJobRepo.findOne({ where: { jobId } });
    if (!job) return;
    const payload = await this.serializeJobWithRecentLogs(job);
    this.emit(jobId, { type: 'snapshot', payload });
  }

  private emit(jobId: string, event: StreamEvent) {
    const listeners = this.streamListeners.get(jobId);
    if (!listeners?.size) return;
    listeners.forEach((listener) => listener(event));
  }

  private async serializeJobWithRecentLogs(job: RenderJobEntity) {
    const recentLogs = await this.renderJobLogRepo.find({
      where: { jobId: job.jobId, userId: job.userId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      jobId: job.jobId,
      source: job.source,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      message: job.failedReason || job.message || undefined,
      imageUrl: job.imageUrl || undefined,
      failedReason: job.failedReason || undefined,
      createdAt: job.createdAt?.toISOString?.() || null,
      startedAt: job.startedAt?.toISOString?.() || null,
      completedAt: job.completedAt?.toISOString?.() || null,
      updatedAt: job.updatedAt?.toISOString?.() || null,
      durationMs: this.calculateDuration(job),
      recentLogs: recentLogs.reverse().map((log) => this.serializeLog(log)),
    };
  }

  private serializeLog(log: RenderJobLogEntity) {
    return {
      id: log.id,
      time: log.createdAt?.toISOString?.() || null,
      stage: log.stage,
      level: log.level,
      message: log.message,
      meta: log.metaJson ? this.safeParse(log.metaJson) : null,
    };
  }

  private calculateDuration(job: RenderJobEntity) {
    if (!job.startedAt) return null;
    const end = job.completedAt || job.updatedAt || new Date();
    return Math.max(0, end.getTime() - job.startedAt.getTime());
  }

  private safeParse(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
