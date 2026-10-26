# Ticket validation and role management

## Ticket validation

`POST /tickets/validate` requires a bearer token and the `CHECK_IN_STAFF` or
`ADMIN` role. The body contains the UUID encoded in the ticket QR code and may
include the ID of the event currently being checked in:

```json
{
  "qrToken": "7a3d3bb5-cf46-4c52-8acf-389ccadf440a",
  "eventId": "42"
}
```

Validation responses use HTTP `200` for both accepted and rejected scans. A
rejection is returned with `accepted: false` and one of these `reason` values:

| Reason | Meaning |
| --- | --- |
| `NOT_FOUND` | No ticket has the submitted QR token. |
| `ALREADY_USED` | The ticket was already checked in. |
| `CANCELLED` | The ticket was cancelled or refunded. |
| `WRONG_EVENT` | The ticket belongs to a different event than the supplied event ID. |
| `EVENT_CANCELLED` | The ticket's event has been cancelled. |

The ticket and its event are locked while the validation is decided. An
accepted ticket is changed from `ISSUED` to `USED` with a conditional update,
which ensures that concurrent scanners cannot both accept the same ticket.
Every decision is written to `ticket_validations`. Audit insertion is isolated
from the validation transaction; if an audit write fails, the validation
result is retained and the failure is logged by the API.

## Role management

Administrators can list users with `GET /users`, optionally using `page`,
`limit` (maximum 100), and `email` query parameters. The email search performs
a case-insensitive substring match. `PATCH /users/{userId}/role` accepts a role
from the supported role values and cannot target the acting administrator.
After a role change, the user must log in again to receive a token with the new
role. Previously issued tokens retain their original role until expiration.

## Database update

The canonical schema is [event_ticket_booking_schema.sql](../event_ticket_booking_schema.sql).
This change requires resetting the local development database so the schema
script can create the updated `ticket_validations` table. Back up any needed
data first; a fresh Docker database volume initializes from the schema SQL.

The validation log table statement in the schema is:

```sql
CREATE TABLE IF NOT EXISTS ticket_validations (
    validation_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id          BIGINT REFERENCES tickets(ticket_id) ON DELETE RESTRICT,
    checked_by         BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    attempted_event_id VARCHAR(30),
    result             VARCHAR(20) NOT NULL CHECK (result IN ('ACCEPTED', 'REJECTED')),
    reason             VARCHAR(30),
    scanned_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes              TEXT,
    CHECK (
        (result = 'ACCEPTED' AND reason IS NULL)
        OR (result = 'REJECTED' AND reason IN (
            'NOT_FOUND', 'ALREADY_USED', 'CANCELLED', 'WRONG_EVENT', 'EVENT_CANCELLED'
        ))
    )
);
```

When opening the pull request, ask the team to update their local databases
before testing. Include the table statement above in the pull-request
description so the database change is visible to reviewers.
