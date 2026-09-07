import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object' && 'message' in payload
          ? Array.isArray(payload.message)
            ? (payload as { message: string[] }).message.join(', ')
            : String(payload.message)
          : 'Internal server error';

    const details =
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { message?: unknown }).message)
        ? (payload as { message: string[] }).message
        : undefined;

    res.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      details,
      path: req.url,
      timestamp: new Date().toISOString(),
      requestId: String(req.header('x-request-id') ?? ''),
    });
  }
}
