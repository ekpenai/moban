import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('render_jobs')
@Index('idx_render_jobs_user_created', ['userId', 'createdAt'])
@Index('idx_render_jobs_job_id', ['jobId'], { unique: true })
export class RenderJobEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'job_id', type: 'varchar', length: 128 })
  jobId: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ type: 'varchar', length: 32, default: 'web' })
  source: string;

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  status: string;

  @Column({ type: 'varchar', length: 64, default: 'queued' })
  stage: string;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  message: string;

  @Column({ name: 'image_url', type: 'varchar', length: 1024, nullable: true, default: null })
  imageUrl: string | null;

  @Column({ name: 'failed_reason', type: 'varchar', length: 1024, nullable: true, default: null })
  failedReason: string | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true, default: null })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true, default: null })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
