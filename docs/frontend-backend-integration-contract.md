# Frontend ↔ Backend integration contract

This document records the API contract exposed by the current NestJS backend.
It deliberately follows the lecturer's constraints: no `/auth/me`, no root
`GET /`, and no separate event publish/cancel endpoints.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- Response: `{ "accessToken": "...", "tokenType": "Bearer" }`
- The frontend should decode the JWT claims (`sub`, `email`, `role`) for display.
  Do not depend on a duplicate `user` object or add `/auth/me`.

## Events

- `POST /events` — creates the event and its ticket types in one request.
- `GET /events` — public published-event listing.
- `GET /events/mine` — organizer's events.
- `GET /events/:id` — event details.
- `PATCH /events/:id` — update fields and change `status` to `PUBLISHED` or
  `CANCELLED`; do not call separate `/publish` or `/cancel` endpoints.
- `GET /events/:eventId/ticket-types`
- `GET /events/:eventId/sales-summary`
- `GET /events/:eventId/attendance-summary`

## Orders and PayChangu

- `POST /orders` — create an order and reserve ticket inventory.
- `GET /orders/mine` — current customer's orders.
- `GET /orders/:orderNumber` — order details.
- `POST /payments/orders/:orderNumber/checkout` — initiate PayChangu checkout.
- `GET /payments/:txRef/verify` — verify payment.
- `POST /payments/paychangu/webhook` — PayChangu webhook.
- `GET /payments/paychangu/callback` — customer return callback.

For a paid checkout, the frontend must use the backend order/payment flow. It
must not treat browser-side payment verification or localStorage ticket
creation as authoritative. The backend webhook/verification path is the
source of truth for fulfillment.

## Tickets

- `GET /tickets/mine` — customer's ticket history, including event/QR details.
- `POST /tickets/purchase` — legacy direct ticket-claim endpoint. Do not use
  this as the paid checkout flow when PayChangu is required.
- `POST /tickets/validate` — staff/admin ticket validation.
- `POST /tickets/events/:eventId/generate` — organizer/admin ticket generation.
- `GET /tickets/events/:eventId` — event ticket listing.

## Frontend changes still required

The frontend code supplied for integration uses some routes/flows that do not
match this backend contract. Update the frontend API adapter as follows:

1. Replace `POST /events/:id/publish` with
   `PATCH /events/:id` and body `{ "status": "PUBLISHED" }`.
2. Replace `DELETE /events/:id` with
   `PATCH /events/:id` and body `{ "status": "CANCELLED" }`.
3. Replace `GET /tickets/history` with `GET /tickets/mine`.
4. Use `POST /orders` followed by
   `POST /payments/orders/:orderNumber/checkout`; verify through
   `GET /payments/:txRef/verify`. Do not call PayChangu directly from the
   browser as the trusted payment authority.
5. Ensure the production reverse proxy forwards the frontend API prefix
   (the supplied Vite setup uses `/be`) to the NestJS server and strips that
   prefix, matching the local Vite proxy behavior.

## Known gaps / items not fabricated by this script

- The backend snapshot did not contain an event-image upload endpoint
  (`POST /events/images`). The frontend expects multipart field `file` and a
  response containing `imageUrl`. Implement storage deliberately (persistent
  volume or object storage) before enabling that UI; do not store uploads only
  in an ephemeral container filesystem.
- The supplied backend snapshot did not contain a complete persistent KYC
  workflow or staff assignment/listing API. The frontend's localStorage-only
  KYC and placeholder staff list are not production verification. These need
  explicit requirements, authorization rules, schema design and forward-only
  migrations; this script does not invent them or mark users verified.
- Confirm the deployed PayChangu credentials and webhook secret are configured
  in the backend environment. Never commit secrets to source control.

## Safety

This integration script does not run migrations, alter database rows, remove
Docker volumes, reset Git, or push/build a Docker image. After reviewing the
frontend changes and completing missing modules, run the database migration
process intentionally, then smoke-test the API before publishing a new image.
