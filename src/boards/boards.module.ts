import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardEntity } from './board.entity';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { UploadAssetEntity } from './upload-asset.entity';
import { BoardVersionEntity } from './board-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BoardEntity, UploadAssetEntity, BoardVersionEntity]), JwtModule.register({})],
  controllers: [BoardsController],
  providers: [BoardsService, JwtAuthGuard],
})
export class BoardsModule {}
