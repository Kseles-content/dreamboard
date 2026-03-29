import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BoardEntity } from './board.entity';

@Entity({ name: 'upload_assets' })
export class UploadAssetEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  boardId!: number;

  @ManyToOne(() => BoardEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boardId' })
  board!: BoardEntity;

  @Column({ type: 'integer' })
  ownerUserId!: number;

  @Column({ type: 'text', unique: true })
  objectKey!: string;

  @Column({ type: 'text' })
  mimeType!: string;

  @Column({ type: 'integer' })
  sizeBytes!: number;

  @Column({ type: 'text' })
  fileName!: string;

  @Column({ type: 'text' })
  status!: 'INTENT_CREATED' | 'READY';

  @Column({ type: 'text', nullable: true })
  publicUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  etag!: string | null;

  @Column({ type: 'datetime', nullable: true })
  finalizedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
