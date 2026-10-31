import { ERROR_CODES, type ErrorCode } from '@impulse/contracts';

/** A failure that is safe to show to a client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  static unauthenticated(message = 'Authentication is required') {
    return new AppError(ERROR_CODES.UNAUTHENTICATED, 401, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(ERROR_CODES.FORBIDDEN, 403, message);
  }

  /** Also used for resources in another tenant, so their existence is never revealed. */
  static notFound(message = 'Resource not found') {
    return new AppError(ERROR_CODES.NOT_FOUND, 404, message);
  }

  static conflict(code: ErrorCode, message: string) {
    return new AppError(code, 409, message);
  }

  static unavailable(message = 'Service temporarily unavailable') {
    return new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, 503, message);
  }
}
