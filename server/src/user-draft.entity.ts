import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_drafts')
export class UserDraft {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id: string;

  @PrimaryColumn({ name: 'user_id', type: 'bigint', unsigned: true })
  @Index('idx_user_updated')
  userId: string;

  @Column({ name: 'template_id', type: 'varchar', length: 128, default: '' })
  templateId: string;

  @Column({ name: 'cover_image', type: 'varchar', length: 1024, default: '' })
  coverImage: string;

  @Column({ name: 'template_width', type: 'int', default: 675 })
  templateWidth: number;

  @Column({ name: 'template_height', type: 'int', default: 1200 })
  templateHeight: number;

  @Column({ name: 'elements_json', type: 'longtext' })
  elementsJson: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
