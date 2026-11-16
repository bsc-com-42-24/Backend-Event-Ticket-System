# Authentication and roles

## Sign up and sign in

`POST /auth/register` creates an `ATTENDEE` account. Send `name`, `email`,
and `password`. Do not send a role. Passwords must be at least eight
characters and fit bcrypt's 72-byte limit. Duplicate email addresses return
`409 Conflict`.

`POST /auth/login` accepts `email` and `password`. The response contains an
access token:

```json
{
  "accessToken": "<signed-jwt>",
  "tokenType": "Bearer"
}
```

Send the token on protected routes:

```http
Authorization: Bearer <accessToken>
```

`GET /auth/me` returns the current user's ID, email, and role. Access tokens
expire after 15 minutes by default. After a role change, the user must sign
in again to receive a token with the new role.

## Roles

| Role | Permissions |
| --- | --- |
| `ATTENDEE` | Browse events, claim tickets, and view personal ticket history |
| `ORGANIZER` | Manage owned events, ticket types, inventory, and reports |
| `CHECK_IN_STAFF` | Validate tickets for events assigned by their organizer |
| `ADMIN` | Manage users and administer any event |

Administrators assign organizer and administrator roles through
`PATCH /users/{userId}/role`. Organizers create check-in staff accounts and
assign events through `/organizers/me/staff`. Organizers cannot access
another organizer's event or ticket inventory. Check-in staff cannot manage
events or list tickets.

## Password and token settings

Set `JWT_SECRET` to a private random string of at least 32 characters and
optionally set `JWT_EXPIRES_IN` (default `15m`). Never store the secret in
frontend code or commit it to source control. Passwords are stored as bcrypt
hashes; authentication responses do not include the hash.

See [the system flow and API guide](./PROJECT_FLOW_AND_API.md) for routes,
request examples, and ticket claim and check-in flows.
