# Authentication and authorization

## Endpoints

### `POST /auth/register`

Registers a customer and returns a bearer access token. The request body contains
`name`, `email`, and `password`. Names and emails are trimmed, emails are stored
lowercase, and passwords are hashed with bcrypt before persistence. Email
addresses are unique. The role is assigned by the server as `CUSTOMER`; any
client-supplied `role` field is rejected.

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
    "id": "<uuid>",
    "name": "Customer",
    "email": "customer@example.com",
    "role": "CUSTOMER"
  }
}
```

## Roles and protected routes

The supported roles are `CUSTOMER`, `EVENT_MANAGER`, `VALIDATOR`, and `ADMIN`.
Roles are persisted on the user record and included in the signed JWT. Use
`JwtAuthGuard` to require a valid login and `RolesGuard` with the `@Roles(...)`
decorator to restrict an authenticated route to specific roles. Apply both
guards to role-restricted routes:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EVENT_MANAGER)
```

Registration does not provide a role-management mechanism; role changes must be
performed through a trusted administrative process, not normal customer
operations.

## Configuration and database

Set `JWT_SECRET` to a secret of at least 32 characters and optionally set
`JWT_EXPIRES_IN` (defaults to `15m`). Create the user table and role enum by
running the TypeORM migrations with the configured PostgreSQL database.
