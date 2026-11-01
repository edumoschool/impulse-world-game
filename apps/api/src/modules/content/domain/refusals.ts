import { ERROR_CODES } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TransitionRefusal } from './lifecycle.js';

/** The client-facing error for a refused lifecycle step. */
export function refusalError(reason: TransitionRefusal): AppError {
  switch (reason) {
    case 'INVALID_TRANSITION':
      return AppError.conflict(
        ERROR_CODES.CONTENT_STATE_INVALID,
        'That step does not apply to this version now',
      );
    case 'FORBIDDEN':
      return AppError.forbidden('You cannot take this step');
    case 'SELF_REVIEW':
      return new AppError(
        ERROR_CODES.SELF_REVIEW,
        403,
        'Someone other than the author must review and publish this version',
      );
    case 'REASON_REQUIRED':
      return new AppError(ERROR_CODES.VALIDATION_FAILED, 400, 'Say why the version is rejected');
  }
}
