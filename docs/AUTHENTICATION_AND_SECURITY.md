# Authentication and Security

## Authentication mechanism

The backend uses JWT-based authentication with NestJS Passport.

- Registration is public.
- Login returns an access token.
- Protected routes require the token in the `Authorization` header.
- `JwtAuthGuard` validates the token.
- `CurrentUser` attaches the authenticated user payload.

The token payload contains:

- `sub`
- `email`
- `role`

## Password handling

Passwords are not stored in plaintext.

- The project uses `bcryptjs`.
- The password hash is generated before user creation.
- Login compares the submitted password against the stored hash.
- The env file validates that `JWT_SECRET` is not left as the example placeholder.

## User registration and login

### Registration

`POST /auth/register` accepts a name, email, and password. Public registration creates an attendee account unless an explicit role is provided.

### Login

`POST /auth/login` checks the email and password. If valid and account active, the API returns a JWT and a bearer token type.

If the account is inactive, the login fails with an unauthorized error.

## Role-based authorization

Role checks are enforced by `RolesGuard` and custom role decorators.

The role values are:

- `ATTENDEE`
- `ORGANIZER`
- `CHECK_IN_STAFF`
- `ADMIN`

Examples:

- Only `ATTENDEE` and `ADMIN` may claim tickets.
- Only `ORGANIZER` and `ADMIN` may create events.
- Only `CHECK_IN_STAFF`, `ORGANIZER`, and `ADMIN` may validate tickets.
- Only `ADMIN` may manage users and review KYC submissions.

## Protected routes and restrictions

Protected routes are enforced by guards and often combined with role checks. The key protections are:

- `JwtAuthGuard` for authentication
- `RolesGuard` for role enforcement
- ownership checks for event managers and organizers
- assignment checks for check-in staff

## Input validation

The code uses NestJS validation pipes and DTO class validation rules, including:

- email format checks
- required fields
- numeric bounds for quantities and limits
- enum checks for roles and statuses
- file size and file type checks for QR image uploads and event images

## Payment security

Paid ticket flows require a verified PayChangu payment when `purchaseRequiresPayment()` is active. The code verifies the transaction and rejects invalid payment references.

Webhook verification is also implemented by checking the incoming signature against the payment provider secret.

## QR validation security

The QR token contains:

- ticket ID
- secure UUID token

A QR scan is accepted only if:

- the QR payload matches the stored record
- the ticket belongs to the correct event
- the ticket is not already used
- the ticket is not cancelled or refunded
- the validator is authorized for the ticket's event

## Audit and moderation logging

Admin actions and KYC review actions write to `audit_logs` to provide traceability for moderation decisions.

## Security notes from the implementation

- Passwords are hashed and never stored in plain text.
- JWT secret is required and must not remain set to the example placeholder.
- CORS origins are configured in `.env` through `CORS_ORIGINS`.
- Event image uploads validate file type and maximum size.
- Production configuration requires explicit environment settings.

## Known security constraints

The current implementation is designed for a local backend service and does not include a full separate identity provider, SSO flow, or multi-tenant RBAC system.
