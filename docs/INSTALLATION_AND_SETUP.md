# Installation and Setup Guide

## Prerequisites

- Node.js 22 or later
- npm
- Docker Desktop or a working Docker engine
- PostgreSQL (provided by Docker Compose in this project)
- Git

## 1. Install dependencies

From the project root:

```powershell
npm install
```

If the lock file is stale, the project README notes that `npm install` is required before `npm ci` can be used reliably. This keeps the dependency tree in sync with the project.

## 2. Configure environment variables

Create a local `.env` file if it does not exist:

```powershell
Copy-Item .env.example .env
```

Then ensure `JWT_SECRET` is set to a real random value and not the sample placeholder. A valid secret is required by the environment validation schema.

Important variables include:

- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ORIGINS`
- `PAYCHANGU_*` values when payment verification is enabled

## 3. Start PostgreSQL

```powershell
docker compose up -d db
```

The project is configured for local PostgreSQL with Docker Compose. The Compose setup loads the SQL schema on first run.

## 4. Start the API

Build the project:

```powershell
npm run build
```

Then start the backend in development mode:

```powershell
npm run start:dev
```

The API listens on:

- `http://localhost:3000`

Swagger documentation is available at:

- `http://localhost:3000/api`

## 5. Run the tests

```powershell
npm test -- --runInBand
```

The project also supports the e2e test script:

```powershell
npm run test:e2e
```

## 6. Running the application locally

A typical local flow is:

1. Start Docker database.
2. Create `.env`.
3. Run `npm install`.
4. Run `npm run build`.
5. Run `npm run start:dev`.
6. Open Swagger UI at `http://localhost:3000/api`.

## 7. Testing the API manually

Once the server is running:

1. Call `POST /auth/register`.
2. Log in with `POST /auth/login`.
3. Copy the `accessToken` into Swagger authorization.
4. Use `GET /auth/me` and then public endpoints such as `GET /events`.

## 8. Environment and deployment notes

- `NODE_ENV` supports `development`, `test`, and `production`.
- Production requires explicit configuration and secure secrets.
- `CORS_ORIGINS` should be a comma-separated list of allowed frontend origins.
- The project is backend-first and does not include a frontend app in this repo.
