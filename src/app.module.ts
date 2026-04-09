import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { BoardsModule } from './boards/boards.module';
import { AuthModule } from './auth/auth.module';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { HealthController } from './health.controller';
import { PrismaModule } from './database/prisma.module';
import { ConfigModule } from './config/config.module';

@Module({
  controllers: [HealthController],
  imports: [ConfigModule, PrismaModule, UsersModule, BoardsModule, AuthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
