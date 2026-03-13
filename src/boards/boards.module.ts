import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { BoardEntity } from './board.entity';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  imports: [TypeOrmModule.forFeature([BoardEntity]), UsersModule],
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
