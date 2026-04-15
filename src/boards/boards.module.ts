import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { SharePublicController } from './share-public.controller';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [BoardsController, SharePublicController, TemplatesController],
  providers: [BoardsService, JwtAuthGuard],
})
export class BoardsModule {}
