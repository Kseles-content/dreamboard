import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { BoardEntity } from '../boards/board.entity';
import { BoardVersionEntity } from '../boards/board-version.entity';
import { RefreshTokenEntity } from '../auth/refresh-token.entity';
import { InitDreamboard1710000000000 } from '../migrations/1710000000000-init';
import { Auth1710000001000 } from '../migrations/1710000001000-auth';

export default new DataSource({
  type: 'sqlite',
  database: process.env.DB_PATH ?? 'dreamboard.sqlite',
  entities: [UserEntity, BoardEntity, BoardVersionEntity, RefreshTokenEntity],
  migrations: [InitDreamboard1710000000000, Auth1710000001000],
});
