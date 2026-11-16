# Ticket Master API

This guide describes the main request flows and API routes. Swagger UI at
`/api` provides the request schemas and response examples.

## Event and ticket flow

1. Register an attendee with `POST /auth/register`, then sign in with
   `POST /auth/login`.
2. An administrator assigns the organizer role through
   `PATCH /users/{userId}/role`. The user signs in again to get a token with
   the updated role.
3. The organizer creates an event and its ticket types with `POST /events`.
   New events start as drafts.
4. Publish the event with `PATCH /events/{eventId}` and
   `{"status":"PUBLISHED"}`.
5. Generate ticket records with
   `POST /tickets/events/{eventId}/generate`. Repeating this request does not
   create duplicates.
6. Attendees browse `GET /events` and check stock at
   `GET /events/{eventId}/availability`.
7. Claim tickets with `POST /tickets/purchase`. The request may include a
   quantity from 1 to 10. Paid tickets require a PayChangu transaction
   reference when payment is enabled; the server verifies the payment before
   assigning tickets.
8. View claimed tickets and QR images with `GET /tickets/history`.
9. Assigned check-in staff submit a QR payload, ticket number, or QR image to
   the validation endpoint. A valid scan changes the ticket from `ISSUED` to
   `USED`; another scan is rejected.
10. Organizers view ticket inventory and check-in progress through the
    sales-summary and check-in-summary endpoints.

## Request path

```text
Client
  -> NestJS controller
  -> DTO validation and authentication/role checks
  -> service ownership and business-rule checks
  -> PostgreSQL
  -> response to client
```

The global validation pipe rejects unknown request fields. Protected routes
require `Authorization: Bearer <accessToken>`. Database IDs are returned as
strings; keep them as strings in JavaScript.

## Roles

| API role | Access |
| --- | --- |
| `ATTENDEE` | Browse events, claim tickets, and view personal ticket history |
| `ORGANIZER` | Manage owned events, ticket types, inventory, and reports |
| `CHECK_IN_STAFF` | Validate tickets for events assigned by their organizer |
| `ADMIN` | Manage users and administer any event |

Public registration creates attendees only. Administrators assign organizer
and administrator roles with `PATCH /users/{userId}/role`. Organizers create
check-in staff accounts and assign events through `/organizers/me/staff`.
Users must sign in again after a role change.

## Main endpoints

### Authentication and users

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/register` | Public | Create an attendee account |
| `POST /auth/login` | Public | Sign in and receive a JWT |
| `GET /auth/me` | Signed in | Return the current user's ID, email, and role |
| `GET /users?page=1&limit=20&email=...` | `ADMIN` | Search and paginate users |
| `PATCH /users/{userId}/role` | `ADMIN` | Assign a role to another user |

### Events and ticket types

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /events` | Public | Browse upcoming published events |
| `GET /events/{eventId}` | Public; drafts are owner/admin only | View event details |
| `GET /events/mine` | `ORGANIZER`, `ADMIN` | List managed events |
| `POST /events` | `ORGANIZER`, `ADMIN` | Create an event and ticket types |
| `PATCH /events/{eventId}` | Owner, `ADMIN` | Update or publish an event |
| `DELETE /events/{eventId}` | Owner, `ADMIN` | Cancel an event |
| `GET /events/{eventId}/availability` | Public | View capacity and available stock |
| `GET /events/{eventId}/ticket-types` | Public for published events | View active ticket types |
| `POST /events/{eventId}/ticket-types` | Owner, `ADMIN` | Add a ticket type |
| `PATCH /events/{eventId}/ticket-types/{ticketTypeId}` | Owner, `ADMIN` | Update a ticket type |
| `GET /events/{eventId}/sales-summary` | Owner, `ADMIN` | View inventory and stock warnings |
| `GET /events/{eventId}/attendance-summary` | Owner, `ADMIN` | View attendance totals |

Example event request:

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

Ticket-type quantities cannot exceed event capacity. Event search accepts
`search`, `location`, `from`, `to`, `availableOnly`, `page`, and `limit`.
Paginated responses include `data` and `meta`.

### Tickets and check-in

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /tickets/purchase` | `ATTENDEE`, `ADMIN` | Claim generated tickets; body includes `eventId`, `ticketTypeId`, optional `quantity` and `txRef` |
| `GET /tickets/history` | `ATTENDEE`, `ADMIN` | View personal tickets and QR images |
| `POST /tickets/events/{eventId}/generate` | Owner, `ADMIN` | Generate missing ticket records |
| `GET /tickets/events/{eventId}` | Owner, `ADMIN` | List event tickets |
| `POST /tickets/validate` | Assigned staff, owner, `ADMIN` | Validate one QR payload or ticket number |
| `POST /tickets/validate/image` | Assigned staff, owner, `ADMIN` | Validate a QR image (maximum 5 MB) |
| `GET /tickets/events/{eventId}/check-in-summary` | Owner, `ADMIN` | View check-in progress |
| `GET /tickets/{ticketNumber}` | Owner, `ADMIN` | View one event ticket |
| `GET /tickets/{ticketNumber}/qr` | Owner, `ADMIN` | View ticket details and its QR image |

Example claim request:

```json
{
  "eventId": "12",
  "ticketTypeId": "3",
  "quantity": 2
}
```

For paid tickets, include the successful PayChangu `txRef`. The API verifies
the reference on the server. Do not treat a browser redirect as confirmation
of payment.

Validation accepts exactly one of `qrToken` or `ticketNumber`; `eventId` is
optional. Responses include `accepted`, `reason`, and a message. HTTP `200`
means the scan was processed, not that entry was accepted. Possible rejection
reasons include `NOT_ASSIGNED`, `NOT_FOUND`, `ALREADY_USED`, `CANCELLED`,
`WRONG_EVENT`, and `EVENT_CANCELLED`.

## Inventory and security

- Ticket records are generated before customers claim them. Claims do not
  create additional inventory.
- Ticket generation and claims use database transactions and row locks to
  prevent overselling.
- Passwords are hashed; password hashes are not returned by the API.
- JWTs expire after 15 minutes by default. Keep `JWT_SECRET` private and at
  least 32 characters long.
- QR payloads contain a ticket ID and a random secret token. The token is not
  returned as plain text in ticket history.
- Uploaded QR images are limited to 5 MB and 25 megapixels.
- Configure `CORS_ORIGINS` as a comma-separated list of frontend origins.
  CORS does not replace authentication or role checks.
- Production startup requires database host and user values, a database
  password of at least 16 characters, a non-example JWT secret, and an
  explicit CORS allowlist.
- Do not commit `.env`; the Compose credentials are for local development.

## Payments

Paid ticket claims use PayChangu verification before tickets are assigned.
Configure the provider secret and callback settings on the server. The
separate orders workflow supports reservations, checkout, payment verification,
and provider callbacks. Sales summaries report payment tracking as
`NOT_CONFIGURED` rather than estimating revenue from ticket counts.
