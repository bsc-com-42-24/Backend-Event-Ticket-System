# API Documentation

This backend exposes a NestJS REST API documented in Swagger at `http://localhost:3000/api` when the application is running. The service base URL is `http://localhost:3000`.

## Authentication

Use a JWT bearer token on protected routes.

```http
Authorization: Bearer <accessToken>
```

### Public endpoints

- `GET /`
- `POST /auth/register`
- `POST /auth/login`
- `GET /events`
- `GET /events/:id`
- `GET /events/:id/availability`
- `GET /events/:id/ticket-types`
- `POST /contact`

### Authenticated endpoints

The token is returned by `POST /auth/login` and contains:

- `sub`
- `email`
- `role`

The token lifetime is controlled by `JWT_EXPIRES_IN` and defaults to `15m`.

## Core endpoints

### Authentication and users

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | Create an attendee account |
| `POST` | `/auth/login` | Public | Sign in and receive a JWT |
| `GET` | `/auth/me` | Any authenticated user | Return current user info |
| `GET` | `/users` | `ADMIN` | Search and paginate users |
| `POST` | `/users` | `ADMIN` | Create a managed user |
| `PATCH` | `/users/:userId/status` | `ADMIN` | Activate or deactivate an account |
| `DELETE` | `/users/:userId` | `ADMIN` | Disable a user account |
| `PATCH` | `/users/:userId/role` | `ADMIN` | Change a user role |

### Event and ticket type management

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/events` | `ORGANIZER`, `ADMIN` | Create an event |
| `GET` | `/events/mine` | `ORGANIZER`, `ADMIN` | List events managed by the user |
| `GET` | `/events` | Public | Browse published events |
| `GET` | `/events/:id` | Public or authenticated | View an event |
| `PATCH` | `/events/:id` | Owner or `ADMIN` | Update an event |
| `DELETE` | `/events/:id` | Owner or `ADMIN` | Cancel an event |
| `GET` | `/events/:id/availability` | Public | Show capacity and stock |
| `POST` | `/events/images` | `ORGANIZER`, `ADMIN` | Upload event image |
| `GET` | `/events/:eventId/ticket-types` | Public for published events | List active ticket types |
| `POST` | `/events/:eventId/ticket-types` | `ORGANIZER`, `ADMIN` | Create a ticket type |
| `PATCH` | `/events/:eventId/ticket-types/:ticketTypeId` | `ORGANIZER`, `ADMIN` | Update ticket type |
| `GET` | `/events/:eventId/sales-summary` | `ORGANIZER`, `ADMIN` | Inventory and revenue summary |
| `GET` | `/events/:eventId/attendance-summary` | `ORGANIZER`, `ADMIN` | Attendance summary |

### Orders, payments, and ticket claims

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/orders` | `ATTENDEE`, `ADMIN` | Create an order and reserve stock |
| `GET` | `/orders/mine` | `ATTENDEE`, `ADMIN` | List user orders |
| `GET` | `/orders/:orderNumber` | `ATTENDEE`, `ADMIN` | View order detail |
| `POST` | `/tickets/purchase` | `ATTENDEE`, `ADMIN` | Claim generated tickets |
| `GET` | `/tickets/history` | `ATTENDEE`, `ADMIN` | Show personal ticket history |
| `POST` | `/tickets/events/:eventId/generate` | `ORGANIZER`, `ADMIN` | Generate missing tickets |
| `GET` | `/tickets/events/:eventId` | `ORGANIZER`, `ADMIN` | List event tickets |
| `GET` | `/tickets/:ticketNumber` | `ORGANIZER`, `ADMIN` | Get one ticket |
| `GET` | `/tickets/:ticketNumber/qr` | `ORGANIZER`, `ADMIN` | Get ticket and QR data |
| `POST` | `/tickets/validate` | `CHECK_IN_STAFF`, `ORGANIZER`, `ADMIN` | Validate a ticket or QR payload |
| `POST` | `/tickets/validate/image` | `CHECK_IN_STAFF`, `ORGANIZER`, `ADMIN` | Validate an uploaded QR image |
| `GET` | `/tickets/events/:eventId/check-in-summary` | `ORGANIZER`, `ADMIN` | View check-in progress |
| `POST` | `/payments/orders/:orderNumber/checkout` | `ATTENDEE`, `ADMIN` | Start PayChangu checkout |
| `GET` | `/payments/:txRef/verify` | `ATTENDEE`, `ADMIN` | Verify payment |
| `POST` | `/payments/paychangu/webhook` | Provider | Receive provider webhook |
| `GET` | `/payments/paychangu/callback` | Public | Handle provider callback |

### Organizer staff and KYC

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/organizers/me/staff` | `ORGANIZER` | Add a check-in staff account |
| `GET` | `/organizers/me/staff` | `ORGANIZER` | List staff accounts |
| `PUT` | `/organizers/me/staff/:staffId/events` | `ORGANIZER` | Assign events to staff |
| `PATCH` | `/organizers/me/staff/:staffId/active` | `ORGANIZER` | Activate or deactivate staff |
| `DELETE` | `/organizers/me/staff/:staffId` | `ORGANIZER` | Remove a staff member |
| `POST` | `/organizers/me/kyc` | `ORGANIZER` | Submit organizer verification |
| `GET` | `/organizers/me/kyc` | `ORGANIZER` | Fetch KYC data |
| `GET` | `/staff/me/events` | `CHECK_IN_STAFF`, `ADMIN` | Show assigned events |

### Admin moderation

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/admin/events` | `ADMIN` | List events across statuses |
| `PATCH` | `/admin/events/:id/status` | `ADMIN` | Moderate event status |
| `GET` | `/admin/kyc` | `ADMIN` | List KYC submissions |
| `PATCH` | `/admin/kyc/:organizerId/review` | `ADMIN` | Approve or reject KYC |
| `GET` | `/admin/audit-logs` | `ADMIN` | Read audit logs |

### Support and contact

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/contact` | Public | Submit a support inquiry |

## Validation and error behavior

The API throws NestJS exceptions. Common responses are:

- `400` for invalid request data or invalid state.
- `401` for missing or invalid token.
- `403` for insufficient permissions.
- `404` for missing resource.
- `409` for capacity or state conflicts.

A typical validation response from ticket scanning is:

```json
{
  "accepted": false,
  "reason": "NOT_ASSIGNED",
  "message": "You are not assigned to this event.",
  "ticketId": null,
  "eventId": null,
  "validatedAt": null,
  "ticket": null,
  "event": null
}
```

## Example request

```http
POST /auth/login
Content-Type: application/json

{
  "email": "organizer@example.com",
  "password": "secret123"
}
```

A successful login returns:

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer"
}
```

## Notes

- `UserRole.CUSTOMER` maps to the stored string `ATTENDEE`.
- `UserRole.EVENT_MANAGER` maps to `ORGANIZER`.
- `UserRole.VALIDATOR` maps to `CHECK_IN_STAFF`.
- Event and ticket IDs are handled as strings in API routes and then converted internally for database usage.
