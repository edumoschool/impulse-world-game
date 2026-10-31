import { describe, expect, it } from 'vitest';
import { buildInvitationToken, parseInvitationToken } from './invitation-token.js';

const tenantId = '0194f7a0-7c3e-7b1a-8a2e-111111111111';

describe('invitation tokens', () => {
  it('round-trips', () => {
    const token = buildInvitationToken(tenantId, 'secret.with.dots');
    expect(parseInvitationToken(token)).toEqual({ tenantId, secret: 'secret.with.dots' });
  });

  it.each(['', 'no-separator', 'not-a-uuid.secret', `${tenantId}.`])('rejects %j', (token) => {
    expect(parseInvitationToken(token)).toBeNull();
  });
});
