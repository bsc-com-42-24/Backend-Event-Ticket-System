# Authentication and authorization

## Endpoints

### `POST /auth/register`

Registers an attendee and returns a bearer access token. The request body
contains `name`, `email`, and `password`, and may include `role`. Names and
emails are trimmed, emails are stored lowercase, and passwords are hashed with
bcrypt before persistence. Email addresses are unique. Registration defaults
to `ATTENDEE` and may explicitly request `ATTENDEE` or `ORGANIZER`;
`CHECK_IN_STAFF` and `ADMIN` cannot be self-assigned.

Passwords must contain at least 8 characters and must fit within bcrypt's
72-byte input limit. Duplicate email addresses return `409 Conflict`; invalid
input returns `400 Bad Request`.

### `POST /auth/login`

Accepts `email` and `password`. Valid credentials return a bearer access token.
Missing users and incorrect passwords both return the same `401 Unauthorized`
response.

### `GET /auth/me`

Requires `Authorization: Bearer <access-token>` and returns the authenticated
user's ID, email, and role. Missing, invalid, or expired tokens are rejected.

Successful registration and login responses have this shape:

```json
{
  "accessToken": "<signed-jwt>",
  "tokenType": "Bearer",
  "user": {
    "id": "<user-id>",
    "name": "Attendee",
    "email": "attendee@example.com",
    "role": "ATTENDEE"
  }
}
```

## Roles and protected routes

The supported role values are `ATTENDEE`, `ORGANIZER`, `CHECK_IN_STAFF`, and
`ADMIN`. Roles are persisted on the user record and included in the signed JWT.
Use `JwtAuthGuard` to require a valid login and `RolesGuard` with the `@Roles(...)`
decorator to restrict an authenticated route to specific roles. Apply both
guards to role-restricted routes:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EVENT_MANAGER)
```

Administrators can list users with `GET /users?page=1&limit=20&email=example`
and change another user's role with `PATCH /users/{userId}/role`. The email
filter is a case-insensitive substring match. Administrators cannot change their
own role. A role change is reflected in newly issued JWTs after that user logs
in again; existing tokens continue to carry their original role until they
expire.

## Ticket validation

`POST /tickets/validate` is available to `CHECK_IN_STAFF` and `ADMIN` users.
Submit the UUID from the QR code as `qrToken`; optionally include `eventId` so
the API can reject a ticket presented at the wrong event. The response has an
`accepted` boolean and a `reason` for rejected scans. Each scan is recorded in
`ticket_validations`, including attempts for unknown QR tokens. See
[ticket-validation-role-management.md](./ticket-validation-role-management.md)
for the rejection reasons and database update instructions.

## Configuration and database

Set `JWT_SECRET` to a secret of at least 32 characters and optionally set
`JWT_EXPIRES_IN` (defaults to `15m`). Initialize the PostgreSQL schema from
[event_ticket_booking_schema.sql](../event_ticket_booking_schema.sql). For the
ticket-validation log change, reset the local development database so the
updated schema is applied; see
[ticket-validation-role-management.md](./ticket-validation-role-management.md).
