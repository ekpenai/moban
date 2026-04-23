import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ default: '未分类' })
  category: string;

  @Index()
  @Column({ default: '未命名模板' })
  name: string;

  @Column()
  width: number;

  @Column()
  height: number;

  @Column('json')
  layers: any;

  @Column('text', { nullable: true })
  thumbnail: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
