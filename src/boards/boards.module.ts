import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardEntity } from './board.entity';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { UploadAssetEntity } from './upload-asset.entity';
import { BoardVersionEntity } from './board-version.entity';
import { ShareLinkEntity } from './share-link.entity';
import { SharePublicController } from './share-public.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BoardEntity, UploadAssetEntity, BoardVersionEntity, ShareLinkEntity]), JwtModule.register({})],
  controllers: [BoardsController, SharePublicController],
  providers: [BoardsService, JwtAuthGuard],
})
export class BoardsModule {}
