# Ticket Event Management System — Management Backend

The **Ticket Event Management System Backend** is a high-performance, modular NestJS application designed specifically for the **management and administration side** of an event and ticketing platform.

This service empowers administrators and event organizers to create and curate events, define ticket tiers with capacity constraints, monitor customer orders, enforce automatic expiration policies on pending reservations, and manage the full payment settlement and refund lifecycle.

---

## 1. Project Overview

This backend is tailored strictly for administrative and operational use cases. Customer-facing ticket discovery and purchasing are handled by separate microservices, while this service acts as the source of truth for:
- Event lifecycle management (Drafting, Publishing, Cancelling, Completion).
- Ticket tier configuration and automated capacity validation.
- Administrative order oversight and manual override capabilities (force-expiry, cancellation).
- Automated background reconciliation and stock replenishment for expired orders.
- Order payment auditing, confirmation, failure tracking, and full refund processing.

---

## 2. Tech Stack

- **Framework**: [NestJS 10](https://nestjs.com/) (TypeScript)
- **Database & ORM**: PostgreSQL 15 with [TypeORM 0.3](https://typeorm.io/)
- **Validation**: `class-validator` and `class-transformer` (strict global `ValidationPipe`)
- **API Documentation**: OpenAPI / [Swagger](https://swagger.io/) via `@nestjs/swagger`
- **Background Tasks**: `@nestjs/schedule` (Cron jobs)
- **Containerization**: Docker & Docker Compose (Multi-stage build, PostgreSQL, pgAdmin)

---

## 3. Prerequisites

Before running the application, ensure the following tooling is installed on your machine:
- **Node.js**: `v20.x` or higher
- **npm** or **pnpm**: `v9.x` or higher
- **Docker & Docker Compose**: Docker Desktop (Windows/macOS) or Docker Engine (Linux)

---

## 4. Getting Started with Docker (Recommended)

Running the entire stack with Docker Compose spins up the NestJS API, PostgreSQL database, and a pgAdmin web interface automatically.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Ticket-event-system-backend
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start the containers**:
   ```bash
   docker-compose up --build
   ```

4. **Verify the services**:
   - **Backend API**: [http://localhost:3000](http://localhost:3000)
   - **Swagger Documentation**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
   - **Health Check**: [http://localhost:3000/health](http://localhost:3000/health)
   - **pgAdmin**: [http://localhost:5050](http://localhost:5050)
     - Username: `admin@admin.com`
     - Password: `admin`
     - Server connection inside pgAdmin: Host `postgres`, Port `5432`, Username `postgres`, Password `postgres`, DB `ticket_event_db`

---

## 5. Running Locally without Docker

If you already have a local PostgreSQL instance running:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Create the PostgreSQL database**:
   ```sql
   CREATE DATABASE ticket_event_db;
   ```

3. **Configure your `.env` file**:
   Ensure `DB_HOST`, `DB_PORT`, `DB_USERNAME`, and `DB_PASSWORD` point to your local PostgreSQL server.

4. **Run the development server**:
   ```bash
   npm run start:dev
   ```

5. **Build and test**:
   ```bash
   # Compile TypeScript
   npm run build

   # Run tests
   npm run test
   ```

---

## 6. API Documentation

Interactive Swagger API documentation is automatically generated and accessible when the server is running:

- **Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

The documentation contains schemas for every request body, query parameter, and HTTP response code.

---

## 7. Environment Variables

| Variable | Description | Default Value | Required |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Application environment (`development`, `production`, `test`) | `development` | No |
| `PORT` | Port number the HTTP API listens on | `3000` | No |
| `DB_HOST` | Hostname or IP of the PostgreSQL instance | `localhost` (or `postgres` in Docker) | Yes |
| `DB_PORT` | PostgreSQL listening port | `5432` | Yes |
| `DB_USERNAME` | PostgreSQL database user | `postgres` | Yes |
| `DB_PASSWORD` | PostgreSQL user password | `postgres` | Yes |
| `DB_NAME` | PostgreSQL database name | `ticket_event_db` | Yes |
| `ORDER_EXPIRY_MINUTES` | Window in minutes before an unpaid order expires | `15` | No |
| `PGADMIN_EMAIL` | Default login email for pgAdmin container | `admin@admin.com` | No |
| `PGADMIN_PASSWORD` | Default login password for pgAdmin container | `admin` | No |

---

## 8. Module Overview & API Endpoints

All management endpoints are grouped under the `/management` prefix.

| Module | Responsibility | HTTP Method | Endpoint | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Health** | System diagnostic probe | `GET` | `/health` | Returns service health status and current timestamp |
| **Events** | Event creation and lifecycle | `POST` | `/management/events` | Create a new event draft |
| | | `GET` | `/management/events` | List events (optional `?status=` filter) |
| | | `GET` | `/management/events/:id` | Get event detail with configured ticket types |
| | | `PATCH` | `/management/events/:id` | Update event information |
| | | `PATCH` | `/management/events/:id/publish` | Publish an event for ticket sales |
| | | `PATCH` | `/management/events/:id/cancel` | Cancel an event |
| **Ticket Types** | Tier allocation & quotas | `POST` | `/management/ticket-types` | Create ticket tier (checks event capacity) |
| | | `GET` | `/management/ticket-types/event/:eventId` | List all ticket tiers for an event |
| | | `GET` | `/management/ticket-types/:id` | Retrieve single ticket tier details |
| | | `PATCH` | `/management/ticket-types/:id` | Update quota, name, or price |
| | | `DELETE` | `/management/ticket-types/:id` | Delete tier (blocked if orders exist) |
| **Orders** | Order monitoring & expiry | `GET` | `/management/orders` | List orders (filters: status, eventId, customerId) |
| | | `GET` | `/management/orders/:id` | Get order details with ticket type and payments |
| | | `PATCH` | `/management/orders/:id/expire` | Force-expire a pending order and replenish stock |
| | | `PATCH` | `/management/orders/:id/cancel` | Cancel an order and replenish stock |
| | | `POST` | `/management/orders` | Create test/simulated order reservation |
| **Payments** | Payment auditing & refunds | `POST` | `/management/payments` | Record new payment transaction |
| | | `GET` | `/management/payments/:id` | View payment transaction details |
| | | `PATCH` | `/management/payments/:id/confirm` | Confirm payment (transitions order to `PAID` if satisfied) |
| | | `PATCH` | `/management/payments/:id/fail` | Mark payment as `FAILED` |
| | | `PATCH` | `/management/payments/:id/refund` | Refund payment, mark order `REFUNDED`, restore stock |
| | | `GET` | `/management/payments/order/:orderId` | List all payments made for an order |
| | | `GET` | `/management/payments/event/:eventId` | List all payments collected across an event |

---

## 9. Order Expiry Architecture

To avoid reserving tickets indefinitely when customers abandon their checkout sessions, the system implements automated stock reclamation:

```
[Customer Reserve Order]
         │
         ▼
[Order Status: PENDING] ──> (expiresAt = now + ORDER_EXPIRY_MINUTES)
         │
         ├───> [Payment Confirmed within window] ──> [Order Status: PAID]
         │
         └───> [Timer Elapses without Payment]
                     │
                     ▼
             [Cron Job Executes Every Minute]
                     │
                     ├──> Finds orders WHERE status = 'PENDING' AND expiresAt < NOW()
                     ├──> Updates Order status to 'EXPIRED'
                     ├──> Restores TicketType.remainingQuantity += Order.quantity
                     └──> Commits atomic database transaction
```

### Manual Overrides
Administrators can also manually force-expire or cancel any pending order at any point via:
- `PATCH /management/orders/:id/expire`
- `PATCH /management/orders/:id/cancel`

Both manual endpoints and the scheduled cron job utilize database transaction locks (`pessimistic_write`) to prevent race conditions during ticket stock adjustments.

---

## 10. Git Workflow Note

When contributing or preparing deliverables for the team:
1. Create a dedicated feature branch from `main`:
   ```bash
   git checkout -b feature/management-backend
   ```
2. Commit your modular changes:
   ```bash
   git add .
   git commit -m "feat: complete ticket event management backend with order expiry and payment lifecycle"
   ```
3. Push your branch to the remote repository:
   ```bash
   git push origin feature/management-backend
   ```
4. The group leader can pull the branch, run `docker-compose up --build`, and verify the entire management system.
