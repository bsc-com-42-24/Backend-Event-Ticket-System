# Ticket types, pricing and monitoring

The Swagger UI at `/api` documents these endpoints and their request examples.
Management endpoints require a bearer token for the event's owning event
manager or an administrator. Public ticket-type listings are limited to
published events. Replace the example IDs and token below with real values.

## Create, view, edit and deactivate ticket types

Create a free or paid ticket type. The sum of all ticket type quantities cannot
exceed event capacity.

```http
POST /events/12/ticket-types
Authorization: Bearer <manager-token>
Content-Type: application/json

{
  "name": "Early Bird",
  "description": "Limited early access tickets.",
  "price": 25.5,
  "currency": "MWK",
  "quantity": 100,
  "perOrderLimit": 4,
  "salesStartAt": "2026-11-01T08:00:00.000Z",
  "salesEndAt": "2026-11-15T18:00:00.000Z"
}
```

```http
GET /events/12/ticket-types
```

This public request lists active ticket types for a published event, including
prices and remaining quantities.

```http
PATCH /events/12/ticket-types/3
Authorization: Bearer <manager-token>
Content-Type: application/json

{
  "price": 30,
  "quantity": 120,
  "perOrderLimit": 5
}
```

The quantity cannot be lowered below sold plus reserved tickets, and the
combined configured quantities cannot exceed event capacity.

```http
POST /events/12/ticket-types/3/deactivate
Authorization: Bearer <manager-token>
```

Deactivation retains the ticket type and its order history, but hides it from
public listings and prevents new purchases.

## Event availability and monitoring

```http
GET /events/12/availability
```

The availability response includes a `ticketTypes` array with per-type price,
quantity, sold, reserved and remaining values.

```http
GET /events/12/sales-summary
Authorization: Bearer <manager-token>
```

Returns sold, reserved, remaining and revenue per type, along with event totals.
Revenue is grouped by currency and includes paid order items only.

```http
GET /events/12/attendance-summary
Authorization: Bearer <manager-token>
```

Returns the number of tickets issued, checked in and not checked in.

## Manual flow for pull-request verification

1. Create an event with capacity 10 and publish it.
2. Create a ticket type with quantity 6, price 100 MWK, and per-order limit 2.
3. Attempt a second type with quantity 5; verify the request is rejected for
   exceeding capacity.
4. Request the public ticket-type listing and event availability; verify the
   active type price and remaining quantity are shown.
5. Create a purchase and verify reserved inventory changes. Pay one order and
   verify sold inventory changes and tickets are issued.
6. Compare the sales summary with pending and paid orders; only paid items
   should contribute to revenue.
7. Check the attendance summary before and after validating an issued ticket.
8. Attempt management and monitoring requests as a different manager and as a
   customer; verify access is denied. Verify the owner and an administrator
   can access the endpoints.
9. Decrease quantity below sold plus reserved; verify the update is rejected.
   Deactivate the type and verify it is no longer publicly listed.

Record the actual environment, request results and response status codes in the
pull request after running this flow against a configured database.
