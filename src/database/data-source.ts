import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { BoardEntity } from '../boards/board.entity';
import { InitDreamboard1710000000000 } from '../migrations/1710000000000-init';

export default new DataSource({
  type: 'sqlite',
  database: process.env.DB_PATH ?? 'dreamboard.sqlite',
  entities: [UserEntity, BoardEntity],
  migrations: [InitDreamboard1710000000000],
});
