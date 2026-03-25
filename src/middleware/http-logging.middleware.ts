import { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';

const logger = new Logger('HTTP');

export function httpLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const requestId = (req as Request & { requestId?: string }).requestId ?? req.header('x-request-id') ?? '-';

  logger.log(`--> ${req.method} ${req.originalUrl} requestId=${requestId}`);

  res.on('finish', () => {
    const duration = Date.now() - started;
    logger.log(
      `<-- ${req.method} ${req.originalUrl} status=${res.statusCode} durationMs=${duration} requestId=${requestId}`,
    );
  });

  next();
}
