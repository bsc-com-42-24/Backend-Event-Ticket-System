# Organizer check-in staff — change summary

## Apply (one command)
Copy this project over your backend folder (keep your own `.env`), make sure your database is
running, then:

    npm run update-backend    # npm ci, run migration, build, run tests
    npm run docker:build      # builds alicekayla/ticket-backend:1.3 - only after the above passes

## New endpoints (organizer role only)
| Method | Path | Purpose |
|---|---|---|
| POST | /organizers/me/staff | Create a check-in staff account |
| GET | /organizers/me/staff | List my staff with assigned events |
| PUT | /organizers/me/staff/:staffId/events | Replace the staff member's assigned events (own events only) |
| PATCH | /organizers/me/staff/:staffId/active | Activate / deactivate |
| DELETE | /organizers/me/staff/:staffId | Remove (disables account, keeps all history) |

## Security changes
- `POST /tickets/validate`: CHECK_IN_STAFF may only validate tickets of events assigned to them
  (`NOT_ASSIGNED` otherwise, no ticket details revealed). ADMIN can still validate any ticket.
- Login rejects disabled accounts; the JWT strategy checks the database on every request, so
  deactivation (and role changes) take effect immediately for already-issued tokens.

## Bug fixed along the way
- A successful validation returned no ticketId/eventId/details (TypeORM returns `[rows, count]`
  for UPDATE ... RETURNING). Fixed in `TicketsService.validateTicket`.

## Behaviour to be aware of
- CHECK_IN_STAFF accounts that existed before (e.g. created by an admin) have no assignments and
  cannot validate tickets until an organizer creates/assigns staff.
- `test/jest-e2e.json` now maps `.js` imports so e2e tests can run.
- `test/app.e2e-spec.ts` was already failing (AppModule does not register AppController); untouched.
