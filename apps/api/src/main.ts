import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap();
