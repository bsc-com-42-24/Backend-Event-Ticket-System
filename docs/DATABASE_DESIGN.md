# Database design

PostgreSQL is the source of truth. The initial schema is
[`event_ticket_booking_schema.sql`](../event_ticket_booking_schema.sql);
TypeORM schema synchronization is disabled. Order/payment tables and the
ticket-to-order-item reference are introduced by migrations.

## Entity relationship diagram

```mermaid
erDiagram
  USERS ||--o{ EVENTS : organizes
  USERS ||--o{ TICKETS : owns
  USERS ||--o{ ORDERS : places
  USERS ||--o{ TICKET_VALIDATIONS : checks
  VENUES o|--o{ EVENTS : hosts
  EVENTS ||--o{ TICKET_TYPES : configures
  EVENTS ||--o{ TICKETS : issues
  EVENTS ||--o{ ORDERS : receives
  TICKET_TYPES ||--o{ TICKETS : classifies
  TICKET_TYPES ||--o{ ORDER_ITEMS : reserves
  ORDERS ||--|{ ORDER_ITEMS : contains
  ORDERS ||--o{ PAYMENTS : paid_by
  ORDER_ITEMS o|--o{ TICKETS : fulfills
  TICKETS o|--o{ TICKET_VALIDATIONS : scanned_as

  USERS {
    bigint user_id PK
    varchar email UK
    text password_hash
    varchar role
    boolean is_active
  }
  EVENTS {
    bigint event_id PK
    bigint organizer_id FK
    integer capacity
    integer tickets_issued
    varchar status
    timestamptz start_at
    timestamptz end_at
  }
  TICKET_TYPES {
    bigint ticket_type_id PK
    bigint event_id FK
    numeric price
    integer quantity_total
    integer quantity_sold
    integer quantity_reserved
  }
  TICKETS {
    bigint ticket_id PK
    bigint event_id FK
    bigint ticket_type_id FK
    bigint customer_id FK
    bigint order_item_id FK
    uuid qr_token UK
    varchar ticket_number UK
    varchar status
  }
  ORDERS {
    bigint order_id PK
    bigint customer_id FK
    bigint event_id FK
    varchar order_number UK
    numeric total_amount
    timestamptz expires_at
    varchar status
  }
  ORDER_ITEMS {
    bigint order_item_id PK
    bigint order_id FK
    bigint ticket_type_id FK
    integer quantity
    numeric unit_price
    numeric subtotal
  }
  PAYMENTS {
    bigint payment_id PK
    bigint order_id FK
    varchar tx_ref UK
    numeric amount
    varchar status
    timestamptz verified_at
  }
  TICKET_VALIDATIONS {
    bigint validation_id PK
    bigint ticket_id FK
    bigint checked_by FK
    varchar result
    varchar reason
    timestamptz scanned_at
  }
  VENUES {
    bigint venue_id PK
    varchar venue_name
    text address
  }
```

`VENUES` and some event descriptive fields are schema capabilities not
currently exposed by the event DTOs. Treat the REST DTOs and Swagger document
as the current API contract.

## Important constraints and invariants

- User email, ticket number, QR token, order number, and payment transaction
  reference are unique.
- Event checks enforce `end_at > start_at`, nonnegative capacity and issued
  count, and `tickets_issued <= capacity`.
- A ticket type belongs to one event. Its `quantity_sold` and
  `quantity_reserved` cannot exceed `quantity_total`.
- Ticket statuses are `ISSUED`, `USED`, `CANCELLED`, or `REFUNDED`.
- Order statuses are `PENDING`, `PAID`, `CANCELLED`, or `EXPIRED`.
- Payment statuses are `PENDING`, `SUCCESS`, `FAILED`, or `CANCELLED`.
- Deleting events with tickets/orders is restricted; cancellation preserves
  history.
- Indexes support event discovery, organizer lookup, customer ticket history,
  unassigned ticket selection, and validation history.

## Capacity and lifecycle

Configured availability for one ticket type is
`quantity_total - quantity_sold - quantity_reserved`. A customer can claim
only existing, unassigned generated tickets. A ticket-generation transaction
locks the event and checks that the additional ticket records fit under event
capacity. Purchase operations lock the relevant inventory rows and update
ticket ownership and sold/reserved counters transactionally.

An unpaid order reserves quantity until its 15-minute expiry. Successful
provider verification fulfills tickets and transfers reserved quantity to
sold quantity. A ticket moves from `ISSUED` to `USED` on its first accepted
scan. Rejected and accepted scans are represented in `ticket_validations`.

For a new database, initialize the base schema and run all migrations. Existing
volumes are not reinitialized by PostgreSQL's Docker entrypoint; back them up
before applying schema changes.
