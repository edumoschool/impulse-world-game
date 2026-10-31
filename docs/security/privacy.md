# Privacy Notes

Engineering record of what is stored about children and why. This is not a legal document. See open decision O2.

## Personal data held for a child

| Field          | Why it is needed        | Notes                           |
| -------------- | ----------------------- | ------------------------------- |
| `display_name` | Shown in the game       | The form suggests a nickname    |
| `username`     | Sign-in                 | Unique per tenant, never public |
| `birth_year`   | Age-appropriate content | Year only, not a date of birth  |
| `locale`       | Interface language      |                                 |
| Passcode       | Sign-in                 | Stored only as an Argon2id hash |

No email, phone number, photo, address, school name or full date of birth is collected.

## Where this data must not appear

Logs, metrics labels, audit metadata, domain events, analytics payloads and error reports. Tests cover redaction, the event schemas and the audit trail.

Sentry 11 collects cookies, headers, query strings and bodies by default. `SENTRY_DATA_COLLECTION` turns all of that off, and a test holds it there.

## Consent

Consent is scoped and versioned, with each change kept as history. `ACCOUNT_ACCESS` gates sign-in, and withdrawing it ends sessions at once. `AI_ASSISTANCE` and `CLASSROOM_LEADERBOARDS` are recorded but have no feature to gate yet.

The `POLICY_VERSION` in `apps/web/src/components/add-child-form.tsx` and the consent wording are placeholders until legal review.

## Not yet implemented

Data export, deletion requests and retention jobs (Stage 8).
