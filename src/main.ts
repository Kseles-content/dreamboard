import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/http-error.filter';
import { httpLoggingMiddleware } from './middleware/http-logging.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(httpLoggingMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(3000);
}

bootstrap();
