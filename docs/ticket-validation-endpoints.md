# Ticket validation endpoints

The check-in staff flow, request bodies, QR payload format, image upload
limits, roles, and validation responses are documented in
[the system flow and API guide](./PROJECT_FLOW_AND_API.md#ticket-claim-and-check-in).

Quick reference:

- `POST /tickets/validate`: send exactly one of `qrToken` (decoded QR text)
  or `ticketNumber`, plus an optional `eventId`.
- `POST /tickets/validate/image`: upload a QR image in the multipart `file`
  field, plus an optional `eventId`.
- `GET /tickets/events/{eventId}/check-in-summary`: manager/admin attendance
  progress.

Both validation endpoints require authentication. The response has HTTP `200`
for a processed scan, so the client must check `accepted`. An accepted scan
changes the ticket to `USED`; a second scan is rejected.
