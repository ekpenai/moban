import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('render_job_logs')
@Index('idx_render_job_logs_job_created', ['jobId', 'createdAt'])
@Index('idx_render_job_logs_user_created', ['userId', 'createdAt'])
export class RenderJobLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'job_id', type: 'varchar', length: 128 })
  jobId: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ type: 'varchar', length: 64, default: 'queued' })
  stage: string;

  @Column({ type: 'varchar', length: 16, default: 'info' })
  level: string;

  @Column({ type: 'varchar', length: 1024 })
  message: string;

  @Column({ name: 'meta_json', type: 'longtext', nullable: true, default: null })
  metaJson: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
