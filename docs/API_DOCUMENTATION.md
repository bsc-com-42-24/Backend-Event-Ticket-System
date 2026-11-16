# API documentation

The local API base URL is `http://localhost:3000`. Swagger UI is available
at `http://localhost:3000/api`.

## Authentication

Register with `POST /auth/register`, then sign in with `POST /auth/login`.
Public registration creates an `ATTENDEE` account. An administrator assigns
organizer or administrator roles. Organizers create check-in staff accounts
and assign them to events.

Use the login response token on protected routes:

```http
Authorization: Bearer <accessToken>
```

Tokens expire after 15 minutes by default. Configure `JWT_EXPIRES_IN` to
change the lifetime.

| API role | Access |
| --- | --- |
| `ATTENDEE` | Browse events, claim tickets, and view personal ticket history |
| `ORGANIZER` | Manage owned events, ticket types, inventory, and reports |
| `CHECK_IN_STAFF` | Validate tickets for assigned events |
| `ADMIN` | Manage users and administer any event |

## Main endpoints

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/register` | Public | Create an attendee account |
| `POST /auth/login` | Public | Sign in and receive a JWT |
| `GET /auth/me` | Signed in | Return the current user's details |
| `GET /users?page=1&limit=20&email=...` | `ADMIN` | Search users |
| `PATCH /users/{userId}/role` | `ADMIN` | Change another user's role |
| `GET /events` | Public | Browse upcoming published events |
| `GET /events/mine` | `ORGANIZER`, `ADMIN` | List managed events |
| `POST /events` | `ORGANIZER`, `ADMIN` | Create an event and ticket types |
| `PATCH /events/{eventId}` | Owner, `ADMIN` | Update or publish an event |
| `DELETE /events/{eventId}` | Owner, `ADMIN` | Cancel an event |
| `GET /events/{eventId}/availability` | Public | View capacity and available stock |
| `GET /events/{eventId}/ticket-types` | Public for published events | View active ticket types |
| `GET /events/{eventId}/sales-summary` | Owner, `ADMIN` | View inventory and warnings |
| `POST /tickets/purchase` | `ATTENDEE`, `ADMIN` | Claim generated tickets |
| `GET /tickets/history` | `ATTENDEE`, `ADMIN` | View personal tickets and QR images |
| `POST /tickets/events/{eventId}/generate` | Owner, `ADMIN` | Generate missing tickets |
| `GET /tickets/events/{eventId}` | Owner, `ADMIN` | List event tickets |
| `POST /tickets/validate` | Assigned staff, owner, `ADMIN` | Validate a QR payload or ticket number |
| `POST /tickets/validate/image` | Assigned staff, owner, `ADMIN` | Validate an uploaded QR image |
| `GET /tickets/events/{eventId}/check-in-summary` | Owner, `ADMIN` | View check-in progress |
| `POST /orders` | `ATTENDEE`, `ADMIN` | Create an order and reserve tickets |
| `GET /orders/mine` | `ATTENDEE`, `ADMIN` | List personal orders |
| `POST /payments/orders/{orderNumber}/checkout` | Order owner, `ADMIN` | Start PayChangu checkout |
| `GET /payments/{txRef}/verify` | Payment owner, `ADMIN` | Verify a payment |
| `POST /payments/paychangu/webhook` | Provider signature | Process a provider notification |

## Create and claim tickets

Create an event with its ticket types, publish the event, then generate ticket
records before attendees claim them. For example:

```json
{
  "title": "Community Concert",
  "description": "An evening of live music.",
  "venue": "Main Hall",
  "location": "Blantyre, Malawi",
  "startAt": "2027-03-10T16:00:00.000Z",
  "endAt": "2027-03-10T20:00:00.000Z",
  "capacity": 100,
  "ticketTypes": [
    {
      "name": "General",
      "price": 0,
      "currency": "MWK",
      "quantity": 100,
      "perOrderLimit": 4
    }
  ]
}
```

Claim tickets with `POST /tickets/purchase`:

```json
{
  "eventId": "12",
  "ticketTypeId": "3",
  "quantity": 1
}
```

The quantity is optional and defaults to `1`; the maximum is `10` and the
ticket type's per-order limit also applies. Paid tickets require a PayChangu
`txRef` when payment is enabled. The backend verifies the payment before
assigning tickets. Free ticket claims do not need a payment reference.

Use `GET /tickets/history` to retrieve ticket details and QR images. Keep
database IDs as strings; converting a bigint ID to a JavaScript number can
lose precision.

## Validate tickets

Send exactly one of `qrToken` or `ticketNumber`. An optional `eventId`
restricts the scan to a specific event.

```json
{
  "qrToken": "{\"ticketId\":\"123\",\"token\":\"<ticket-secret>\"}",
  "eventId": "42"
}
```

The API also accepts a QR image at `POST /tickets/validate/image` as
multipart field `file`; uploads are limited to 5 MB. Check `accepted` in the
response. HTTP `200` means the scan was processed, not that the ticket was
accepted. Check-in staff can validate only events assigned by their
organizer. Possible rejection reasons include `NOT_ASSIGNED`, `NOT_FOUND`,
`ALREADY_USED`, `CANCELLED`, `WRONG_EVENT`, and `EVENT_CANCELLED`.

## Errors and frontend requests

NestJS returns standard exception responses. Common status codes are `400`
for invalid input, `401` for missing or invalid authentication, `403` for
insufficient permissions, `404` for missing resources, and `409` for state or
capacity conflicts.

```js
const response = await fetch('http://localhost:3000/events', {
  headers: { Authorization: `Bearer ${accessToken}` },
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(Array.isArray(error.message)
    ? error.message.join(', ')
    : error.message ?? `Request failed (${response.status})`);
}

const events = await response.json();
```

Set `CORS_ORIGINS` to a comma-separated list of allowed frontend origins.
Production requires an explicit allowlist. Keep `.env` and provider secrets
out of source control.
