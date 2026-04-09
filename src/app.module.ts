import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { UsersModule } from './users/users.module';
import { BoardsModule } from './boards/boards.module';
import { AuthModule } from './auth/auth.module';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { HealthController } from './health.controller';
import { PrismaModule } from './database/prisma.module';
import { ConfigModule } from './config/config.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: seconds(60),
        limit: 200,
        skipIf: () => process.env.NODE_ENV === 'test',
      },
    ]),
    PrismaModule,
    UsersModule,
    BoardsModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
