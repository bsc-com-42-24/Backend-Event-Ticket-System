# Installation and operations

## Requirements

- Node.js 22 or later and npm
- Docker Desktop / Docker Engine with Docker Compose v2
- PostgreSQL is supplied by Compose, or configure a separate PostgreSQL server

## Environment setup

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env` before starting the API. Set a private database password, a
unique `JWT_SECRET` of at least 32 characters, and any required payment
settings. Keep `.env` private and never replace an existing `.env` without
preserving its database credentials and secrets.

`DB_HOST=localhost` and `DB_PORT=5432` are for running NestJS directly on the
host. Compose overrides the API's DB host to `db` and its internal DB port to
`5432`. Compose publishes PostgreSQL on `DB_PUBLISHED_PORT` (default `5432`)
for host-run tools; set `DB_PORT` to the same host port if it is changed.
`API_PUBLISHED_PORT` controls the host port for the API.

`DB_USERNAME`, `DB_PASSWORD`, and `DB_NAME` initialize a new PostgreSQL data
volume. Changing them in `.env` does not rewrite an existing database or its
credentials; coordinate database-side changes and app configuration rather
than recreating the volume.

## Run with Docker Compose (recommended)

From the repository root:

```powershell
npm ci
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs -f api db
```

Compose starts PostgreSQL first and waits for its health check before starting
the API. The API applies pending TypeORM migrations during startup and has its
own health check. Visit `http://localhost:3000/api` for Swagger (or use the
configured `API_PUBLISHED_PORT`).

Useful lifecycle and diagnostic commands:

```powershell
docker compose up --build -d api
docker compose restart api
docker compose logs --tail 200 api
docker compose logs --tail 200 db
docker compose ps
docker compose stop
docker compose down
```

`stop` and `down` preserve the named `dbdata` volume. Never add `-v` to
`docker compose down` unless you intentionally want to permanently remove
that database volume. Compose names its containers from the project and
service (`...-api-1`, `ticket-db`); avoid `docker run` without `--name`, which
creates the random container names that are difficult to manage. Compose
does not remove unrelated containers or images.

The mounted `event_ticket_booking_schema.sql` runs only when Postgres creates
a fresh data directory. Existing data volumes are not reinitialized.
The SQL file is the current baseline for users/events/tickets, and the active
TypeORM migrations add later tables/columns. The separate
`src/database/legacy-migrations` folder is intentionally excluded: its old
UUID-based users table conflicts with the current BIGINT identity schema and
must not be applied to this database.

## Run the API on the host

Start only the database and then run NestJS:

```powershell
docker compose up -d db
npm ci
npm run build
npm run start:dev
```

The host API uses `DB_HOST=localhost` and `DB_PORT` from `.env`. PostgreSQL
must be healthy and reachable at that exact host/port. In a container, use
the Compose service DNS name `db`, never `localhost`, for PostgreSQL.

## Migrations and tests

TypeORM schema synchronization is disabled. Normal API startup applies
pending migrations; the migration CLI is also available:

```powershell
npm run migration:run
npm run build
npm test -- --runInBand
npm run test:e2e
```

Review a migration and take a verified backup before applying schema changes
to valuable or production data. A migration revert may drop tables or
columns and lose data; review its `down` implementation and obtain the
database owner's approval before running `npm run migration:revert`. Do not
run migration commands concurrently with application startup.

## Backup and restore without deleting existing data

Create a PostgreSQL custom-format backup and copy it out of the database
container:

```powershell
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/ticket-master.dump'
docker compose cp db:/tmp/ticket-master.dump .\ticket-master.dump
Get-Item .\ticket-master.dump
```

Keep the backup in a protected location. To verify/restore it without
overwriting the active database, copy it back and restore into a separate,
new database:

```powershell
docker compose cp .\ticket-master.dump db:/tmp/ticket-master.dump
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" ticket_master_restore'
docker compose exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d ticket_master_restore /tmp/ticket-master.dump'
```

The restore commands deliberately use `ticket_master_restore` and do not use
`--clean` or drop/replace the current database. Confirm the restored tables
and data before planning any recovery. A restore to the active database is a
separate, potentially destructive operation and is not documented here.

## Authentication smoke test

See [Authentication and role management](./AUTHENTICATION_AND_SECURITY.md)
for attendee/organizer/staff registration and administrator bootstrap
examples. `POST /auth/register`, `POST /auth/login`, and `GET /auth/me` can be
tested in Swagger at `http://localhost:3000/api`.
