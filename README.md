# Ticket Master backend

NestJS REST API for event discovery, ticket orders, payments, and QR
check-in. PostgreSQL stores users, events, inventory, tickets, and validation
history.

## Run with Docker Compose

Use Node.js 22, npm, and Docker Compose v2. Create `.env` from the example
once, then set a private database password and unique JWT secret. Preserve
any existing `.env` file and its database credentials.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env before starting the services.
npm ci
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs -f api db
```

The API is at `http://localhost:3000`; Swagger is at
`http://localhost:3000/api`. The API waits for PostgreSQL health and applies
pending TypeORM migrations during startup. The Compose database volume is
persistent: `docker compose down` preserves it; do not use
`docker compose down -v` unless you have explicitly decided to delete the
database.

For rebuilding/restarting and a safe backup/restore procedure, see the
[installation and operations guide](./docs/INSTALLATION_AND_SETUP.md).

## Run the API on the host

Set `DB_HOST=localhost` and `DB_PORT=5432` in `.env`, then:

```powershell
docker compose up -d db
npm ci
npm run build
npm run start:dev
```

Inside Docker, the API connects to the database at host `db`, port `5432`.
Do not use `localhost` for the database from inside the API container.

## Authentication and API

Public registration supports `ATTENDEE` and `ORGANIZER`. Check-in staff are
created through an organizer-owned staff roster or by an administrator on an
active organizer's roster. Administrator registration is never public; an
operator-only CLI bootstraps the first administrator and refuses to run when
an active administrator already exists.

See the
[authentication and security guide](./docs/AUTHENTICATION_AND_SECURITY.md)
for exact request/response payloads, role boundaries, and administrator
recovery steps. The [API catalog](./docs/API_DOCUMENTATION.md) lists the
routes and their required roles.

## Tests

```powershell
npm run build
npm test -- --runInBand
npm run test:e2e
```

End-to-end tests require a reachable PostgreSQL database with the base schema
and migrations applied.
