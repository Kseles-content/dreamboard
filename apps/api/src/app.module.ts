import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';

@Module({
  imports: [AuthModule, BoardsModule],
  controllers: [AppController],
})
export class AppModule {}
