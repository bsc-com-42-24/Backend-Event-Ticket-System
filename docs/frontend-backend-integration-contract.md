# Frontend and backend integration

The backend API is served locally at `http://localhost:3000`. Swagger UI is
available at `http://localhost:3000/api`.

## Authentication

- `POST /auth/register` creates an attendee account.
- `POST /auth/login` returns `accessToken` and `tokenType`.
- `GET /auth/me` returns the signed-in user's ID, email, and role.
- Send protected requests with `Authorization: Bearer <accessToken>`.

Public registration cannot assign privileged roles. Administrators assign
organizer roles; organizers create check-in staff accounts and assign them
to events.

## Events

- `POST /events` creates an event and its ticket types.
- `GET /events` lists upcoming published events.
- `GET /events/mine` lists the organizer's events.
- `GET /events/{eventId}` returns event details.
- `PATCH /events/{eventId}` updates an event or publishes a draft with
  `{"status":"PUBLISHED"}`.
- `DELETE /events/{eventId}` cancels an event.
- `GET /events/{eventId}/availability` returns current ticket availability.
- Ticket-type, sales-summary, and attendance-summary routes are under
  `/events/{eventId}`.

## Tickets and check-in

- `POST /tickets/events/{eventId}/generate` creates missing ticket records
  from active ticket-type quantities.
- `POST /tickets/purchase` claims generated tickets. A free claim needs
  `eventId`, `ticketTypeId`, and optional `quantity`. A paid claim also needs
  a successful PayChangu `txRef` when payment is enabled.
- `GET /tickets/history` returns the caller's tickets and QR images.
- `POST /tickets/validate` accepts exactly one of `qrToken` or
  `ticketNumber`.
- `POST /tickets/validate/image` accepts an image in multipart field `file`.
- `GET /tickets/events/{eventId}/check-in-summary` returns check-in progress.

Check-in staff can validate only tickets for events assigned by their
organizer. A successful scan changes the ticket status to `USED`; later scans
are rejected.

## Orders and PayChangu

- `POST /orders` creates an order and reserves ticket inventory.
- `GET /orders/mine` lists the caller's orders.
- `GET /orders/{orderNumber}` returns an order and its items.
- `POST /payments/orders/{orderNumber}/checkout` starts provider checkout.
- `GET /payments/{txRef}/verify` checks a payment with the provider.
- `POST /payments/paychangu/webhook` processes a signed provider notification.
- `GET /payments/paychangu/callback` verifies a returned transaction.

The backend verifies payments with PayChangu. The frontend must not treat a
browser redirect or local ticket state as proof that a payment succeeded.
Keep provider credentials on the server and configure allowed frontend
origins with `CORS_ORIGINS`.
