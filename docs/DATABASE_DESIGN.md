# Database Design

The application stores its main business state in PostgreSQL. The schema is created by the SQL seed file at `event_ticket_booking_schema.sql` and extended by migrations in `src/database/migrations`.

## Primary tables

### `users`

Stores all system users.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `BIGINT` PK | Generated identity |
| `full_name` | `VARCHAR(150)` | Person name |
| `email` | `VARCHAR(255)` | Unique |
| `password_hash` | `TEXT` | Hashed with bcryptjs |
| `phone` | `VARCHAR(30)` | Optional |
| `role` | `VARCHAR(20)` | `ATTENDEE`, `ORGANIZER`, `ADMIN`, `CHECK_IN_STAFF` |
| `is_active` | `BOOLEAN` | Account active/inactive flag |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Update timestamp |

### `events`

Stores each event.

| Column | Type | Notes |
| --- | --- | --- |
| `event_id` | `BIGINT` PK | Event identity |
| `organizer_id` | `BIGINT` FK | Event owner |
| `venue` | `VARCHAR(150)` | Venue name |
| `location` | `VARCHAR(255)` | Event location |
| `capacity` | `INTEGER` | Maximum event ticket capacity |
| `tickets_issued` | `INTEGER` | Count of generated tickets |
| `status` | `VARCHAR(20)` | `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED` |
| `start_at`, `end_at` | `TIMESTAMPTZ` | Event time window |
| `sales_start_at`, `sales_end_at` | `TIMESTAMPTZ` | Sales window |
| `published_at`, `cancelled_at` | `TIMESTAMPTZ` | Lifecycle timestamps |

### `ticket_types`

Stores each event ticket category.

| Column | Type | Notes |
| --- | --- | --- |
| `ticket_type_id` | `BIGINT` PK | Ticket type identity |
| `event_id` | `BIGINT` FK | Parent event |
| `type_name` | `VARCHAR(100)` | Ticket label |
| `price` | `NUMERIC(12,2)` | Price in MWK |
| `currency` | `CHAR(3)` | Default `MWK` |
| `quantity_total` | `INTEGER` | Total inventory |
| `quantity_sold` | `INTEGER` | Sold quantity |
| `quantity_reserved` | `INTEGER` | Reserved pending order quantity |
| `per_order_limit` | `INTEGER` | Max per purchase |
| `sales_start_at`, `sales_end_at` | `TIMESTAMPTZ` | Sales window |
| `is_active` | `BOOLEAN` | Active/inactive flag |

### `tickets`

Stores each issued ticket.

| Column | Type | Notes |
| --- | --- | --- |
| `ticket_id` | `BIGINT` PK | Ticket identity |
| `ticket_number` | `VARCHAR(50)` | Unique ticket reference |
| `event_id` | `BIGINT` FK | Event |
| `ticket_type_id` | `BIGINT` FK | Ticket type |
| `customer_id` | `BIGINT` FK | Assigned attendee |
| `qr_token` | `UUID` | Secure QR payload value |
| `status` | `VARCHAR(20)` | `ISSUED`, `USED`, `CANCELLED`, `REFUNDED` |
| `issued_at` | `TIMESTAMPTZ` | Issued time |
| `checked_in_at` | `TIMESTAMPTZ` | Validation timestamp |

### `ticket_validations`

Stores every validation attempt.

| Column | Type | Notes |
| --- | --- | --- |
| `validation_id` | `BIGINT` PK | Validation record |
| `ticket_id` | `BIGINT` FK | Ticket used in scan |
| `checked_by` | `BIGINT` FK | Validator user |
| `attempted_event_id` | `VARCHAR(30)` | Event provided in validation |
| `result` | `VARCHAR(20)` | `ACCEPTED` or `REJECTED` |
| `reason` | `VARCHAR(30)` | Validation reason |
| `scanned_at` | `TIMESTAMPTZ` | Attempt timestamp |
| `notes` | `TEXT` | Optional notes |

## Supporting tables

### `organizer_staff`

Maps each staff account to its managing organizer.

### `staff_event_assignments`

Maps a check-in staff member to the event(s) they can validate.

### `organizer_kyc`

Stores organizer verification documents.

### `contact_messages`

Stores public contact form submissions.

### `audit_logs`

Stores moderation and administrative actions.

### `orders` and `order_items`

Tracks reservations and customer order details before the final ticket assignment.

### `payments`

Stores payment status and verification data for PayChangu transactions.

## Important relationships

- `users` to `events`: one organizer manages many events.
- `events` to `ticket_types`: one event has many ticket categories.
- `ticket_types` to `tickets`: each ticket belongs to one type.
- `events` to `tickets`: each ticket belongs to one event.
- `users` to `tickets`: a customer may hold many tickets.
- `users` to `ticket_validations`: a validator records many attempts.
- `users` to `organizer_staff`: each organizer manages staff records.
- `organizer_staff` to `staff_event_assignments`: staff have many assigned events.

## ER overview

```text
users 1---* events
users 1---* tickets
users 1---* organizer_staff
organizer_staff 1---* staff_event_assignments
events 1---* ticket_types
events 1---* tickets
ticket_types 1---* tickets
users 1---* ticket_validations
users 1---* orders
orders 1---* order_items
ticket_types 1---* order_items
orders 1---* payments
```

## Data integrity rules

The database enforces several checks:

- Event capacity cannot be below zero.
- Ticket count cannot exceed event capacity.
- Ticket type stock cannot be negative.
- Validation reason must be one of the allowed rejection values.
- Events cannot end before they start.
- `tickets_issued <= capacity` is enforced.

These checks protect the business logic from invalid states even when application logic is bypassed.
