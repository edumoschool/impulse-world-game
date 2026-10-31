import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { type ApiFailure, ERROR_CODES, type ErrorCode } from '@impulse/contracts';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import { AppError } from './app-error.js';
import { currentRequestId } from './request-context.js';

const HTTP_CODES: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: ERROR_CODES.VALIDATION_FAILED, message: 'Malformed request' },
  404: { code: ERROR_CODES.NOT_FOUND, message: 'Resource not found' },
  413: { code: ERROR_CODES.VALIDATION_FAILED, message: 'Request body is too large' },
};

/** Clients only ever receive a code and a safe message. Details stay in the logs. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const { status, body } = this.toFailure(exception, http.getRequest<Request>());
    response.status(status).json(body);
  }

  private toFailure(exception: unknown, request: Request): { status: number; body: ApiFailure } {
    const meta = { requestId: currentRequestId() };

    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          success: false,
          error: { code: exception.code, message: exception.message, details: exception.details },
          meta,
        },
      };
    }

    const status = httpStatusOf(exception);
    if (status !== undefined && status < 500) {
      const known = HTTP_CODES[status];
      return {
        status,
        body: {
          success: false,
          error: {
            code: known?.code ?? ERROR_CODES.VALIDATION_FAILED,
            message: known?.message ?? 'Request could not be processed',
          },
          meta,
        },
      };
    }

    this.logger.error({ err: exception, route: request.route?.path }, 'Unhandled exception');
    Sentry.captureException(exception);
    return {
      status: 500,
      body: {
        success: false,
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'An unexpected error occurred' },
        meta,
      },
    };
  }
}

function httpStatusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  // Body-parser failures reach the filter as plain errors carrying a status.
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}
