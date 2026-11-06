# Ticket validation and role management

## Validate and check in a ticket

`POST /tickets/validate` requires a bearer token. Check-in staff and
administrators can validate any ticket. An event manager can validate tickets
only for events they manage. A successful decision checks the ticket in
immediately; this endpoint is not a read-only preview.

Send exactly one of `qrToken` or `ticketNumber`. The QR's decoded text is JSON
with a ticket ID and a secret token:

```json
{
  "qrToken": "{\"ticketId\":\"123\",\"token\":\"7a3d3bb5-cf46-4c52-8acf-389ccadf440a\"}",
  "eventId": "42"
}
```

Or enter the printed ticket number:

```json
{
  "ticketNumber": "TKT-7F3A92C14B",
  "eventId": "42"
}
```

An optional `eventId` rejects tickets belonging to another event. Validation
returns HTTP `200` for both decisions. The frontend must check `accepted`;
`reason` describes a rejection. A rejected scan is not an API transport error.

`POST /tickets/validate/image` accepts multipart form data. Use the `file`
field for the QR image and optionally include `eventId`. Uploads are limited
to 5 MB; image decoding is limited to 25 megapixels.

The ticket row and event row are locked while validation runs. The first valid
scan changes `ISSUED` to `USED`. Every later scan is rejected as
`ALREADY_USED`. Attempts are added to `ticket_validations`.

## User role management

Only an administrator can use:

- `GET /users?page=1&limit=20&email=example` to search users.
- `PATCH /users/{userId}/role` to assign a role.

An administrator cannot change their own role. Public registration creates
attendees only. Users must sign in again after a role change for the updated
role to appear in their JWT.

For route tables and frontend examples, see
[the system flow and API guide](./PROJECT_FLOW_AND_API.md).
