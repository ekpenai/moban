import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Setting {
  @PrimaryColumn()
  key: string;

  @Column('json')
  value: any;
}
