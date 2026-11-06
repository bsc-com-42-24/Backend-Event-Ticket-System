# Ticket Master backend

NestJS REST API for event discovery, ticket types, ticket claims, and QR
check-in. PostgreSQL stores users, events, ticket inventory, tickets, and
validation history.

## Run locally

Run these commands from the repository root in PowerShell. Install Docker
Desktop and Node.js 22 first.

1. Install dependencies and repair the stale lockfile:

   ```powershell
   npm install
   npm ls @nestjs/swagger
   ```

   The checked-in lockfile was missing `jsqr`, `sharp`, and their dependency
   entries, so `npm ci` fails until `npm install` synchronizes it. Keep and
   commit the resulting `package-lock.json`; future clean installs can use
   `npm ci`.

2. Create the local environment file and replace the example JWT secret with
   a private random value:

   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   node -e "const fs=require('fs');const p='.env';const s=fs.readFileSync(p,'utf8');if(!/^JWT_SECRET=.*$/m.test(s))throw Error('JWT_SECRET not found in .env');fs.writeFileSync(p,s.replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+require('crypto').randomBytes(32).toString('hex')))"
   ```

   This replaces only `JWT_SECRET` in `.env` with a newly generated 32-byte
   value and does not print it. The copy step only creates `.env` if it does
   not already exist. Run the `node` command again if `.env` still contains
   the example placeholder. Leave the local database settings as-is unless
   you changed the Compose configuration.

3. Start PostgreSQL:

   ```powershell
   docker compose up -d db
   ```

   On its first start with a new volume, Docker loads
   [`event_ticket_booking_schema.sql`](./event_ticket_booking_schema.sql).
   Existing volumes are not reinitialized.

4. Build and run the API:

   ```powershell
   npm run build
   npm run start:dev
   ```

   Keep this terminal open. The API listens on `http://localhost:3000`.

## Test endpoints in Swagger

1. Open [Swagger UI](http://localhost:3000/api).
2. Expand `GET /`, click **Try it out**, then **Execute**. A successful
   response is `200` with `Ticket Master API is running`.
3. Expand `POST /auth/register`, click **Try it out**, and submit:

   ```json
   {
     "name": "Swagger Tester",
     "email": "swagger.tester@example.com",
     "password": "local-test-password"
   }
   ```

   Registration creates an `ATTENDEE` account. Use a new email if this one is
   already registered.
4. Run `POST /auth/login` with the same email and password. Copy the
   `accessToken` from the response.
5. Click **Authorize** at the top of Swagger UI, paste only the token string
   (no quotation marks or prefix), then authorize and close the dialog.
6. Run `GET /auth/me`. It should return the signed-in user's ID, email, and
   `ATTENDEE` role. Run `GET /events` to try a public endpoint.
7. To sign out in Swagger, click **Authorize** again and clear/revoke the
   token.

Self-registration only creates attendees. Organizer/admin operations (such as
creating events, generating tickets, and managing users) require a token for
an account that already has the corresponding role; an attendee token should
receive `403 Forbidden` for those operations. See
[`docs/PROJECT_FLOW_AND_API.md`](./docs/PROJECT_FLOW_AND_API.md) for role
requirements and example event, ticket, and QR-check-in flows.

To run the automated tests in another terminal:

```powershell
npm test -- --runInBand
```

Set `CORS_ORIGINS` to a comma-separated list of frontend origins when the UI
is hosted on another port or domain.

## Project guide

Read [the system flow and frontend API guide](./docs/PROJECT_FLOW_AND_API.md)
for the end-to-end flow, roles, data storage, security rules, endpoint
examples, inventory limits, and known payment limitation.
