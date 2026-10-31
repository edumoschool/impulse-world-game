# ADR-005: Short-Lived JWTs with Rotating Opaque Refresh Tokens

**Status:** Accepted, 2026-10-31

## Decision

**Access tokens** are JWTs signed with HS256 and valid for 10 minutes. Claims: `sub`, `sid` (session), `tid` (active tenant), `kind` (adult or child). Authorization data is not stored in the token. Each request loads the session and permissions from the database, so revocation and role changes apply immediately.

**Refresh tokens** are 256-bit random strings. Only a SHA-256 hash is stored. Each use consumes the token and issues a successor, in one transaction with an atomic compare (`WHERE consumed_at IS NULL`).

**Reuse detection:** presenting a consumed token revokes the whole session and writes a security audit event. One exception: within a 10-second grace window the request is rejected without revoking. Browsers and mobile clients routinely fire two refreshes at once, and treating that as theft would log children out at random.

**Transport:** clients choose at login.

| Client | Transport                                                                                                               | CSRF                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Web    | `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Same-origin through a Next.js rewrite, so no credentialed CORS is needed. | Required on unsafe methods: `X-CSRF-Token` must equal an HMAC of the session id. |
| Mobile | Tokens in the response body, held in `expo-secure-store`.                                                               | Not applicable, since a bearer header is not sent automatically.                 |

**Passwords** use Argon2id. The dummy-hash path on unknown accounts keeps login timing uniform.

**Rate limiting** uses Redis counters per IP and per account. If Redis is unavailable, credential endpoints fail closed with 503 and other endpoints fail open, because availability of learning content should not depend on the limiter.

## Consequences

- One indexed session query per request. Acceptable at the capacity target, and cacheable later if measured to matter.
- HS256 means verifiers hold the signing key. If a service is ever extracted, move to an asymmetric algorithm with `kid`-based rotation.
