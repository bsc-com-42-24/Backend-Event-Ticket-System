# Ticket validation and check-in endpoints

All check-in endpoints require a bearer access token. Validation routes are
available to `CHECK_IN_STAFF`, `ORGANIZER` (for events they manage), and
`ADMIN`. A successful validation checks the ticket in immediately; these
routes are not read-only previews.

## Upload a QR image

`POST /tickets/validate/image` accepts `multipart/form-data` and validates a
ticket by decoding the QR code in the uploaded image. Use the `file` field for
the image and optionally provide `eventId` to ensure the ticket belongs to the
event being checked in.

Example request:

```bash
curl -X POST http://localhost:3000/tickets/validate/image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@ticket-qr.jpg" \
  -F "eventId=42"
```

The upload is limited to 5 MB and image decoding is limited to 25 megapixels.
The image format is detected from its contents rather than trusted from its
filename or MIME type. Supported formats are those supported by the deployed
`sharp`/libvips build, including common JPEG, PNG, WebP, GIF, TIFF, and AVIF
images.

## Validate using a token or ticket number

`POST /tickets/validate` accepts JSON when the client has already scanned the
QR code or needs to enter the ticket number manually. Supply exactly one of
`qrToken` or `ticketNumber`; `eventId` is optional.

```json
{
  "qrToken": "7a3d3bb5-cf46-4c52-8acf-389ccadf440a",
  "eventId": "42"
}
```

```json
{
  "ticketNumber": "TKT-7F3A92C14B",
  "eventId": "42"
}
```

Both validation routes return HTTP `200` for accepted and rejected decisions.
The response includes `accepted`, `reason`, and `message`. When a ticket is
identified, `ticket` and `event` include the ticket status, ticket type, owner
name, event title, venue, location, and event schedule. A QR that cannot be
decoded or does not contain a ticket UUID returns HTTP `400`.

Example accepted response:

```json
{
  "accepted": true,
  "reason": null,
  "message": "Ticket accepted. Admit guest.",
  "ticketId": "123",
  "eventId": "42",
  "validatedAt": "2026-10-24T15:00:00.000Z",
  "ticket": {
    "id": "123",
    "ticketNumber": "TKT-7F3A92C14B",
    "status": "USED",
    "checkedInAt": "2026-10-24T15:00:00.000Z",
    "ticketType": "General Admission",
    "ownerName": "Jane Doe"
  },
  "event": {
    "id": "42",
    "title": "Launch Party",
    "venue": "Main Hall",
    "location": "Blantyre",
    "startAt": "2026-10-24T18:00:00.000Z",
    "endAt": "2026-10-24T22:00:00.000Z",
    "status": "PUBLISHED"
  }
}
```

Rejections may include the identified ticket and event details:

| `reason` | Meaning |
| --- | --- |
| `NOT_FOUND` | No ticket has the submitted QR token or ticket number. |
| `ALREADY_USED` | The ticket has already been checked in. |
| `CANCELLED` | The ticket was cancelled or refunded. |
| `WRONG_EVENT` | The ticket belongs to a different event than `eventId`. |
| `EVENT_CANCELLED` | The ticket's event has been cancelled. |

Validation locks the ticket and event while deciding whether to admit the
guest. An accepted ticket changes from `ISSUED` to `USED`; concurrent scans
cannot both admit the same ticket. Each decision is written to
`ticket_validations`.

## View event check-in progress

`GET /tickets/events/{eventId}/check-in-summary` returns issued, checked-in,
and remaining ticket counts. It is restricted to the event's organizer and
administrators.

## Retrieve the customer's ticket QR

Customers can retrieve their own ticket's QR image as a PNG data URL with
`GET /tickets/{ticketNumber}/qr`. The QR encodes the ticket's secret
`qrToken`; it can be downloaded or rendered as an image and uploaded to
`POST /tickets/validate/image` by check-in staff.

`GET /tickets/{ticketNumber}` retrieves the ticket record without generating a
QR image. Both customer routes only expose the ticket to its owner or an
administrator.
