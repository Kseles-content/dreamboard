import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { BoardsModule } from './boards/boards.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DB_PATH ?? 'dreamboard.sqlite',
      synchronize: false,
      autoLoadEntities: true,
      migrations: ['dist/migrations/*.js'],
    }),
    UsersModule,
    BoardsModule,
  ],
})
export class AppModule {}
