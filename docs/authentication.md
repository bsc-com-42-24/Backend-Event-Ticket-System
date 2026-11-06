# Authentication and roles

## Sign up and sign in

`POST /auth/register` creates an `ATTENDEE` account. Send `name`, `email`, and
`password`; do not send a privileged role. Passwords must be at least eight
characters and fit bcrypt's 72-byte limit. Duplicate email addresses return
`409 Conflict`.

Only an administrator can promote a user to `ORGANIZER`, `CHECK_IN_STAFF`, or
`ADMIN` using `PATCH /users/{userId}/role`.

`POST /auth/login` accepts `email` and `password`. A successful response
contains:

```json
{
  "accessToken": "<signed-jwt>",
  "tokenType": "Bearer",
  "user": {
    "id": "123",
    "name": "Attendee",
    "email": "attendee@example.com",
    "role": "ATTENDEE"
  }
}
```

Send the token on protected routes:

```http
Authorization: Bearer <accessToken>
```

`GET /auth/me` returns the current user's ID, email, and role. Access tokens
expire after 15 minutes by default. After an administrator changes a role,
the user must sign in again to receive a token with the new role.

## Roles

| Role | Permissions |
| --- | --- |
| `ATTENDEE` | Browse events, claim available free tickets, and view their own ticket history. |
| `ORGANIZER` | Create/manage owned events and ticket types, generate tickets, and view reports. |
| `CHECK_IN_STAFF` | Validate ticket QR payloads and manually entered ticket numbers. |
| `ADMIN` | Manage users and roles, and manage any event or ticket. |

Event ownership is checked in the service as well as by the role guard. An
organizer cannot access another organizer's private event, ticket IDs, or
ticket inventory. Check-in staff can validate a ticket but cannot manage
event settings or list ticket inventory.

## Password and token settings

Set `JWT_SECRET` to a private random string of at least 32 characters and
optionally set `JWT_EXPIRES_IN` (default `15m`). Never store the secret in
frontend code or commit it to source control. Passwords are stored as bcrypt
hashes; authentication responses do not include the hash.

See [the system flow and API guide](./PROJECT_FLOW_AND_API.md) for all routes,
request examples, frontend integration, and the paid-checkout limitation.
