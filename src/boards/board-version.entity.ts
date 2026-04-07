import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'board_versions' })
export class BoardVersionEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  boardId!: number;

  @Column({ type: 'integer' })
  ownerUserId!: number;

  @Column({ type: 'text' })
  snapshotJson!: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
