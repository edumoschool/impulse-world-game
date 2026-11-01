import type { MessageKey } from '@impulse/localization';
import { ApiError } from './api';

const KNOWN_ERRORS = new Set<string>([
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'CONSENT_REQUIRED',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'RESET_TOKEN_INVALID',
  'RATE_LIMITED',
  'MFA_REQUIRED',
  'MFA_INVALID',
  'INVITATION_INVALID',
  'LAST_OWNER',
  'FORBIDDEN',
  'NETWORK',
]);

/** Errors are shown from translated catalogues, never from the API's English messages. */
export function errorKey(error: unknown): MessageKey {
  if (error instanceof ApiError && KNOWN_ERRORS.has(error.code)) {
    return `error.${error.code}` as MessageKey;
  }
  return 'error.UNKNOWN';
}
