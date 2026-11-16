# Presentation guide

Use the following sequence to demonstrate the running API. Refer to
[System architecture](./SYSTEM_ARCHITECTURE.md) and
[Database design](./DATABASE_DESIGN.md) for diagrams and schema details.

## Presentation sequence

1. Explain the problem: event registration needs reliable capacity tracking
   and a way to prevent duplicate entry.
2. Introduce the system: a NestJS API, PostgreSQL database, and separate
   frontend client.
3. Show the main modules and database relationships.
4. Register an attendee with `POST /auth/register`, sign in with
   `POST /auth/login`, and inspect the account with `GET /auth/me`.
5. Use an administrator account to assign the `ORGANIZER` role to a demo
   account. Public registration cannot create privileged users.
6. Sign in as the organizer, create an event with a ticket type, and publish
   it with `PATCH /events/{eventId}`.
7. Generate the ticket records with
   `POST /tickets/events/{eventId}/generate`.
8. Browse events and availability as an attendee. Claim a free ticket with
   `POST /tickets/purchase`, then show it with `GET /tickets/history`.
9. Create check-in staff as the organizer and assign them to the event.
10. Submit the QR payload to `POST /tickets/validate`. Show the successful
    result, then submit it again and show the `ALREADY_USED` response.
11. Show the check-in summary at
    `GET /tickets/events/{eventId}/check-in-summary`.
12. Explain authorization, database transactions, capacity limits, and the
    requirement to verify PayChangu payments before assigning paid tickets.
13. Show the PostgreSQL and API services with `docker compose up --build -d`.

## Example ticket claim

```json
{
  "eventId": "12",
  "ticketTypeId": "3",
  "quantity": 1
}
```

Paid ticket purchases need a successful PayChangu transaction reference when
payment is enabled. Do not present a redirect or an unverified reference as
proof of payment. Production also requires an administrator account and
provider configuration; public registration does not create administrator
accounts.
