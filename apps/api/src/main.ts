import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { load as loadYaml } from 'js-yaml';
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

  const openApiPath = path.resolve(process.cwd(), '../../packages/contracts/openapi/openapi.yaml');
  const openApiDoc = loadYaml(readFileSync(openApiPath, 'utf8')) as OpenAPIObject;
  SwaggerModule.setup('api-docs', app, openApiDoc);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap();
