import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const requestId = request.requestId ?? (request.headers['x-request-id'] as string | undefined) ?? null;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const body = exceptionResponse as Record<string, unknown>;
      response.status(status).json({
        code: (body.code as string | undefined) ?? DEFAULT_CODES[status] ?? 'ERROR',
        message: (body.message as string | undefined) ?? 'Unexpected error',
        requestId: (body.requestId as string | undefined) ?? requestId,
        details: body.details ?? undefined,
      });
      return;
    }

    response.status(status).json({
      code: DEFAULT_CODES[status] ?? 'ERROR',
      message:
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : exception instanceof Error
            ? exception.message
            : 'Unexpected error',
      requestId,
    });
  }
}
