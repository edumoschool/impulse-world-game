# ADR-012: MFA Recovery Codes, and Sessions That Lose Their Tenant

**Status:** Accepted, 2026-11-01

## Context

Two gaps appeared while building the Stage 2 screens.

1. An adult with an authenticator had no way back in if they lost their phone, and no way to turn MFA off. There is no support tooling yet, so a lost phone meant a lost account.
2. Removing a member from a school made the guard refuse every request on any session whose active tenant was that school. That included `GET /auth/session`, `POST /auth/switch-tenant` and `POST /auth/logout`, so the person could not even sign out until the session expired.

## Decision

**Recovery codes.** Confirming an authenticator issues ten single-use codes. Each code has ten characters from an alphabet without look-alike characters (about 49 bits). Only an HMAC-SHA256 of each code is stored, keyed with `AUTH_ENCRYPTION_KEY`. A plain hash would not do: 49 bits can be brute-forced offline from a leaked table, and a per-code password hash would make each login attempt run up to ten slow hashes.

- A code is spent with a conditional update (`used_at IS NULL`), so two concurrent uses cannot both succeed.
- A wrong recovery code counts toward the same login lockout as a wrong password.
- Issuing a new set needs a current authenticator code. Turning MFA off needs the password and then a second factor, which can be a recovery code. The password is checked first, so a wrong password never spends a code.
- Codes are shown once, in the browser. The QR code is drawn in the browser too, so the TOTP secret is never sent to an image service.

**Lost membership.** When the guard finds that the session's active tenant no longer includes the user, it moves the session to the user's first remaining tenant (or none). The update is conditional on the old value, so it cannot undo a switch made at the same moment.

- A route that needs permissions is still refused with 403. A request meant for the old tenant must never run against a different one.
- A route that only needs a signed-in user (`@Authenticated()`) continues on the new tenant.

## Consequences

- Removal still takes effect on the next request, as ADR-005 requires. The person keeps a working account in their other tenants.
- `user_mfa_recovery_codes` is a platform-global table, like `user_mfa_factors`. It has no tenant and no row-level security. The runtime role may delete from it, and it may now delete from `user_mfa_factors`, because turning MFA off removes both.
- Rotating `AUTH_ENCRYPTION_KEY` invalidates recovery codes as well as TOTP secrets. Key rotation needs a re-encryption plan before production.
- Adults can now turn off MFA themselves. Once platform administration routes exist, accounts that must have MFA (spec 24.3) need a rule that stops them from turning it off.
