import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { SharePublicController } from './share-public.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [BoardsController, SharePublicController],
  providers: [BoardsService, JwtAuthGuard],
})
export class BoardsModule {}
