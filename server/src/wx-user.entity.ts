import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wx_users')
export class WxUser {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Index('uniq_openid', { unique: true })
  @Column({ type: 'varchar', length: 128 })
  openid: string;

  @Index('idx_unionid')
  @Column({ type: 'varchar', length: 128, nullable: true, default: null })
  unionid: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  appid: string | null;

  @Column({ name: 'nick_name', type: 'varchar', length: 64, default: '微信用户' })
  nickName: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, default: '' })
  avatarUrl: string;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  gender: number;

  @Column({ type: 'varchar', length: 64, default: '' })
  country: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  province: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  city: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  language: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true, default: null })
  lastLoginAt: Date | null;
}
