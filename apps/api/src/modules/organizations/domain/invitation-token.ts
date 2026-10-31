export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The token names its tenant so that it can be looked up under normal RLS, with no need for the
 * system role. The tenant part is only a routing hint: the secret must match a row in that tenant.
 */
export function buildInvitationToken(tenantId: string, secret: string): string {
  return `${tenantId}.${secret}`;
}

export function parseInvitationToken(token: string): { tenantId: string; secret: string } | null {
  const separator = token.indexOf('.');
  if (separator === -1) {
    return null;
  }
  const tenantId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  return UUID.test(tenantId) && secret.length > 0 ? { tenantId, secret } : null;
}
