# Security controls and operational notes

## Authentication and authorization

- Registration only permits the customer role (`ATTENDEE`); it cannot grant
  organizer, entry-staff, or administrator access.
- Passwords are hashed with bcryptjs (12 salt rounds). Login returns a
  short-lived signed JWT; password hashes are excluded from normal entity
  selection.
- Protected routes verify bearer tokens and apply role guards. Services also
  check event ownership before returning or changing private event data.
- Customer ticket and order queries are constrained to the authenticated
  customer ID. Administrators may manage user roles but cannot change their
  own role through the role endpoint.

## Input, database, and ticket integrity

- Global DTO validation transforms input, strips no unknown fields silently,
  and rejects non-whitelisted properties.
- SQL values use parameters. Event/type inventory changes use transactions
  and row locks. Ticket claims operate on generated inventory rather than
  inserting unbounded ticket rows.
- QR tokens are random UUIDs and are checked together with the ticket ID.
  QR images encode only ticket lookup credentials, not customer data.
- Validation uses a row lock and a conditional `ISSUED` to `USED` update to
  prevent duplicate simultaneous admission. Validation responses distinguish
  rejection from infrastructure errors.
- Uploaded QR images are limited to one file and 5 MiB.

## Secrets, CORS, and payments

- Set `JWT_SECRET` to a unique random value of at least 32 characters. Never
  commit `.env`; `.env.example` contains placeholders only.
- Production requires an explicit `CORS_ORIGINS` allowlist. Do not use
  wildcard origins with credentials.
- PayChangu keys and webhook secret are optional environment settings. The
  webhook signature is checked with HMAC-SHA256 and a constant-time byte
  comparison. Payment status is checked with the provider; webhook payload
  status alone is not trusted.
- Do not log, return, or commit provider credentials, bearer tokens, password
  hashes, or raw payment secrets. Keep provider metadata access restricted.
- Validation and authorization failures use explicit NestJS HTTP exceptions.
  Internal unhandled errors should remain generic to clients; inspect
  server-side logs without returning stack traces or database diagnostics.

## Limitations to address before production

- Configure production-grade database credentials and secret storage, TLS,
  backups, monitoring, and network restrictions.
- There is no rate-limit/throttling configuration in the current API; add and
  test one before exposing login or payment endpoints to untrusted traffic.
- Validate provider webhook header conventions and callback origins against
  the live provider contract before deployment.
- The project has no documented production account bootstrap procedure.
  Provision the first administrator securely outside public registration.
- Run the automated tests and an integration test against PostgreSQL before
  relying on transaction and migration behavior in production.
