# Ticket Master API flow and endpoint guide

This guide follows the endpoint groups and route names in Swagger at `/api`.
Use Swagger's request schemas for exact DTO fields and response shapes.

## 1. End-to-end flow

1. An attendee registers with `POST /auth/register`, signs in with
   `POST /auth/login`, then uses the returned JWT for protected endpoints.
2. An administrator promotes the account through `PATCH /users/{userId}/role`.
   The promoted user signs in again to receive a JWT with the new role.
3. An organizer creates an event and its ticket types with `POST /events`.
   New events are `DRAFT` by default and are not visible in public discovery.
4. The organizer publishes the draft using `PATCH /events/{id}` with
   `{"status":"PUBLISHED"}`. There is no separate publish endpoint.
5. Before attendees can claim tickets, the organizer calls
   `POST /tickets/events/{eventId}/generate`. This creates any missing ticket
   records up to the active ticket types' configured quantities. Repeating
   the request does not create duplicates.
6. Attendees discover events with `GET /events`, optionally searching by
   keyword, location, date range, or availability. They can inspect ticket
   stock with `GET /events/{id}/availability`.
7. An attendee claims available free tickets with `POST /tickets/purchase`.
   The API checks that the event and ticket sales are open, stock is available,
   and the quantity is within the per-order limit.
8. The attendee gets ticket details and QR images from `GET /tickets/history`.
   Check-in staff validate a QR payload, ticket number, or uploaded QR image
   with the validation endpoints.
9. Organizers review their tickets and check-in progress. A valid scan changes
   the ticket to `USED`; the ticket cannot be checked in a second time.

## 2. How a request moves through the API

```text
Frontend
   | JSON, query parameters, bearer JWT, or QR image
   v
NestJS controller
   | DTO validation -> JWT/role guards -> ownership check
   v
Service
   | parameterized SQL / TypeORM queries
   v
PostgreSQL
   | response data (never password hashes)
   v
Frontend
```

- Input JSON and query strings are checked by the global Nest validation
  pipe. Unknown JSON fields are rejected.
- `POST /auth/login` checks the password against its bcrypt hash and returns a
  short-lived JWT. Send it as `Authorization: Bearer <access-token>`.
- Guards check the user's role. Organizer actions also check event ownership;
  an administrator can manage any event.
- PostgreSQL stores accounts in `users`, events in `events`, ticket prices and
  limits in `ticket_types`, individual tickets in `tickets`, and scan attempts
  in `ticket_validations`.
- Bigint database IDs are returned as strings. Treat IDs as strings in
  JavaScript; converting them to `Number` can lose precision.
- TypeORM schema synchronization is off. A new Docker database volume loads
  the canonical SQL schema at startup. Existing volumes are not
  automatically reinitialized.

## 3. Roles

| Role | Main access |
| --- | --- |
| `ATTENDEE` | Browse events, view public ticket prices, claim free tickets, and see their own ticket history. |
| `ORGANIZER` | Create and manage their own events, ticket types, inventory, and event reports. |
| `CHECK_IN_STAFF` | Validate a QR payload or ticket number and check a ticket in. |
| `ADMIN` | Manage users and roles, and administer any event or ticket. |

Public registration creates an attendee account only. An administrator must
assign `ORGANIZER`, `CHECK_IN_STAFF`, or `ADMIN` through
`PATCH /users/{userId}/role`. The user must sign in again to get a JWT with
the updated role.

## 4. Endpoint guide

Interactive request and response schemas are available at `/api`.

### Health

| Method and path | Access | What happens |
| --- | --- | --- |
| `GET /` | Public | Confirms that the API process is responding. |

### Users

| Method and path | Access | What happens |
| --- | --- | --- |
| `GET /users?page=1&limit=20&email=...` | Admin | Returns a paginated user list. `email` searches by case-insensitive substring. |
| `PATCH /users/{userId}/role` | Admin | Changes another user's role. That user must sign in again to receive a token with the new role. |

### Auth

| Method and path | Access | What happens |
| --- | --- | --- |
| `POST /auth/register` | Public | Creates an attendee account from `name`, `email`, and `password`. Elevated roles cannot be self-assigned. |
| `POST /auth/login` | Public | Checks email and password, then returns an access token and account details. |
| `GET /auth/me` | Signed in | Returns the authenticated account's ID, email, and role; send the bearer token. |

### Events and discovery

| Method and path | Access | What happens |
| --- | --- | --- |
| `POST /events` | Organizer/admin | Creates an event and its ticket types together. The status defaults to `DRAFT`; combined ticket quantities cannot exceed event capacity. |
| `GET /events` | Public | Lists upcoming published events. `search` matches title, description, venue, or location; optional `location`, `from`, `to`, `availableOnly`, `page`, and `limit` further filter or paginate results. |
| `GET /events/mine` | Organizer/admin | Lists events managed by the caller, including drafts and cancelled events. Supports pagination, event filters, and `status`. |
| `GET /events/{id}` | Public; drafts are owner/admin only | Returns event details. Drafts are hidden from callers who cannot manage the event. |
| `PATCH /events/{id}` | Event owner/admin | Updates event fields. Set `status` to `PUBLISHED` to publish a draft; a published event cannot be moved back to draft. |
| `DELETE /events/{id}` | Event owner/admin | Cancels the event by changing its status; event and ticket history are retained. |
| `GET /events/{id}/availability` | Public | Returns capacity, generated tickets, remaining claimable stock by type, sale-open state, and generation/low-stock indicators. |

Example event creation:

```json
{
  "title": "Product Launch",
  "description": "A public product launch.",
  "venue": "Main Hall",
  "location": "Blantyre, Malawi",
  "startAt": "2027-03-10T16:00:00.000Z",
  "endAt": "2027-03-10T20:00:00.000Z",
  "capacity": 100,
  "ticketTypes": [
    {
      "name": "Standard",
      "price": 0,
      "currency": "MWK",
      "quantity": 90,
      "perOrderLimit": 4
    },
    {
      "name": "VIP",
      "price": 25000,
      "currency": "MWK",
      "quantity": 10,
      "perOrderLimit": 2
    }
  ]
}
```

After creation, publish the draft by updating its status:

```http
PATCH /events/12
Authorization: Bearer <access-token>
Content-Type: application/json

{"status":"PUBLISHED"}
```

The public event list supports keyword browsing, for example:

```http
GET /events?search=product%20launch&location=Blantyre&page=1&limit=10
```

The `search` term is matched case-insensitively against the title,
description, venue, and location. Event list/detail responses include
`unallocatedCapacity`, the event capacity not yet represented by generated
ticket records. Availability reports `remainingTickets` across active types
and a `needsGeneration` flag. `ticketsIssued` counts generated records;
attendee claims and check-ins are tracked separately.

### Tickets and check-in

| Method and path | Access | What happens |
| --- | --- | --- |
| `POST /tickets/purchase` | Attendee/admin | Claims free tickets for `eventId` and `ticketTypeId`. `quantity` defaults to `1`; paid ticket types are rejected because checkout is not configured. |
| `GET /tickets/history` | Signed-in attendee/admin | Lists the caller's claimed tickets, event details, and QR images. |
| `POST /tickets/events/{eventId}/generate` | Event owner/admin | Generates only missing ticket records for active ticket types. |
| `GET /tickets/events/{eventId}` | Event owner/admin | Lists ticket records for an event the caller manages. |
| `POST /tickets/validate` | Check-in staff/event owner/admin | Validates exactly one QR payload or ticket number, optionally scoped to an event, and returns an admission decision. |
| `POST /tickets/validate/image` | Check-in staff/event owner/admin | Reads a QR code from multipart field `file` (maximum 5 MB); optional `eventId` prevents cross-event check-in. |
| `GET /tickets/events/{eventId}/check-in-summary` | Event owner/admin | Shows check-in progress for the managed event. |
| `GET /tickets/{ticketNumber}/qr` | Event owner/admin | Returns a managed event's ticket details and QR image. |
| `GET /tickets/{ticketNumber}` | Event owner/admin | Returns a single ticket from an event the caller manages. |

Example free ticket claim:

```http
POST /tickets/purchase
Authorization: Bearer <access-token>
Content-Type: application/json

{"eventId":"12","ticketTypeId":"3","quantity":2}
```

The response contains the claimed tickets and a `qrCodeDataUrl` for each one.
The QR payload binds the ticket ID to a separate secret token. Do not construct
or alter this payload on the client.

For `POST /tickets/validate`, provide exactly one of `qrToken` or
`ticketNumber`. An optional `eventId` makes the validator reject a ticket for
another event. For `POST /tickets/validate/image`, upload the QR image as
multipart field `file`; an `eventId` is optional.

Validation returns `accepted`, `reason`, `message`, and (if the ticket was
identified) ticket and event details. An HTTP `200` means validation
completed, not necessarily that the guest should be admitted. Check
`accepted`; rejection reasons can include `NOT_FOUND`, `ALREADY_USED`,
`CANCELLED`, `WRONG_EVENT`, and `EVENT_CANCELLED`.

### Ticket types and monitoring

| Method and path | Access | What happens |
| --- | --- | --- |
| `GET /events/{eventId}/ticket-types` | Public for published events | Lists active ticket types, prices, sale windows, and available stock. |
| `POST /events/{eventId}/ticket-types` | Event owner/admin | Adds a ticket type without exceeding event capacity. |
| `PATCH /events/{eventId}/ticket-types/{ticketTypeId}` | Event owner/admin | Updates a type; its quantity cannot be lower than sold plus reserved tickets. |
| `POST /events/{eventId}/ticket-types/{ticketTypeId}/deactivate` | Event owner/admin | Stops new claims for a type while preserving its historical records. |
| `GET /events/{eventId}/sales-summary` | Event owner/admin | Summarizes sold, reserved, and remaining inventory and warning flags. |
| `GET /events/{eventId}/attendance-summary` | Event owner/admin | Summarizes attendee claims, check-ins, and guests not yet checked in. |

`NEEDS_GENERATION` means the planned inventory has not all been generated.
`LOW_STOCK` means 10 or fewer claimable tickets remain. `SOLD_OUT` means the
configured quantity is already sold or reserved. These are API warnings for
the frontend to display; the backend does not send email, SMS, or push alerts.

## 5. Limits and security notes

- Passwords are hashed with bcrypt; password hashes are never returned by
  account endpoints.
- JWTs expire (15 minutes by default). Keep `JWT_SECRET` private and at least
  32 characters long. Never put it in frontend code.
- Elevated roles require administrator assignment. Organizers can only change
  their own events and ticket types.
- Capacity and sales checks use database transactions and row locks to
  prevent overselling.
- QR payloads contain the ticket ID and a cryptographically random secret.
  The secret is not returned in ticket history; the QR image is.
- Each ticket can be checked in once. A repeated scan returns `ALREADY_USED`;
  every scan attempt is recorded for review.
- Uploaded QR images are limited to 5 MB and image decoding to 25 megapixels.
- CORS is restricted to the comma-separated origins in `CORS_ORIGINS`.
  Configure it for the deployed frontend; CORS is not a replacement for login
  or role checks.
- In production, startup requires explicit database host/user, a database
  password of at least 16 characters, a non-example JWT secret, and configured
  CORS origins.
- Do not commit `.env`. The sample credentials in `docker-compose.yml` are for
  local development only and must be replaced for deployment.

## 6. Payment limitation

Ticket prices and currencies can be configured and shown to the frontend, but
there is no payment provider, order ledger, payment callback, or refund flow
in this backend yet. `POST /tickets/purchase` rejects ticket types whose price
is greater than zero. The sales summary returns
`revenueByCurrency: null` and `paymentTracking: "NOT_CONFIGURED"` rather than
inventing revenue.

Before launching paid sales, the team must select and configure a payment
provider, then add verified payment callbacks and order/refund records. Do not
mark an order paid based only on a frontend request.
