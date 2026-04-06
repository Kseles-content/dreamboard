import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'share_links' })
export class ShareLinkEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  boardId!: number;

  @Column({ type: 'integer' })
  ownerUserId!: number;

  @Column({ type: 'text', unique: true })
  token!: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt!: Date | null;
}
