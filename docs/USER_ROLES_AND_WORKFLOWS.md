# User Roles and Workflows

The system implements four primary roles. The value is stored in the `users.role` column and mapped in `UserRole`.

| Role | Stored value | Main purpose |
| --- | --- | --- |
| Admin | `ADMIN` | Manage the platform, review KYC, and moderate events |
| Organizer | `ORGANIZER` | Manage events, ticket types, inventory, and staff |
| Attendee | `ATTENDEE` | Discover events and purchase tickets |
| Check-in Staff | `CHECK_IN_STAFF` | Validate tickets for assigned events |

## 1. Admin

### Responsibilities

- Review all events and their statuses.
- Publish, draft, or cancel events.
- Review organizer KYC submissions.
- Approve or reject organizer verification.
- View audit logs and moderation events.
- Manage user role changes.

### Permissions

Administrators can access any protected route that requires `ADMIN` role. They can also manage any event and validate any ticket.

### Access

Administrators sign in with `POST /auth/login` and use the returned JWT bearer token.

### Key actions

- `GET /admin/events`
- `PATCH /admin/events/:id/status`
- `GET /admin/kyc`
- `PATCH /admin/kyc/:organizerId/review`
- `GET /admin/audit-logs`
- `PATCH /users/:userId/role`

## 2. Organizer

### Responsibilities

- Create and manage events.
- Set ticket types and prices.
- Publish events for customer discovery.
- Generate tickets for active ticket types.
- View sales and attendance summaries.
- Assign and manage check-in staff.
- Submit and maintain KYC information.

### Permissions

Organizers may manage only their own events and ticket inventory. They may validate tickets only for their own events, unless they are also administrators.

### Access

Organizers are assigned the `ORGANIZER` role by an administrator or system owner and authenticate with JWT.

### Key actions

- `POST /events`
- `GET /events/mine`
- `PATCH /events/:id`
- `DELETE /events/:id`
- `POST /events/:eventId/ticket-types`
- `PATCH /events/:eventId/ticket-types/:ticketTypeId`
- `GET /events/:eventId/sales-summary`
- `GET /events/:eventId/attendance-summary`
- `POST /tickets/events/:eventId/generate`
- `POST /organizers/me/staff`
- `PUT /organizers/me/staff/:staffId/events`
- `PATCH /organizers/me/staff/:staffId/active`
- `DELETE /organizers/me/staff/:staffId`
- `POST /organizers/me/kyc`
- `GET /organizers/me/kyc`

## 3. Attendee

### Responsibilities

- Discover published events.
- View event details and ticket types.
- Claim tickets after payment verification where required.
- View purchased tickets and QR codes.
- See their own order history.

### Permissions

Attendees may access public event APIs and their own personal history. They may not manage events or validate tickets.

### Access

Self-registration creates an `ATTENDEE` account. The user logs in through `POST /auth/login` and calls protected endpoints with a bearer token.

### Key actions

- `POST /auth/register`
- `POST /auth/login`
- `GET /events`
- `GET /events/:id`
- `GET /events/:id/availability`
- `GET /events/:id/ticket-types`
- `POST /orders`
- `GET /orders/mine`
- `POST /tickets/purchase`
- `GET /tickets/history`
- `POST /payments/orders/:orderNumber/checkout`
- `GET /payments/:txRef/verify`

## 4. Check-in staff

### Responsibilities

- Validate attendee tickets at event entry.
- Work only with events assigned by the organizer.
- Reject invalid, wrong-event, duplicate, or unassigned attempts.
- Maintain a validation record per scan attempt.

### Permissions

Check-in staff can validate only events in `staff_event_assignments` for their organizer-owned profile. They cannot manage events or ticket inventory.

### Access

The organizer creates a staff profile and assigns event access. Staff login through the same authentication flow and use the JWT token for protected validation routes.

### Key actions

- `GET /staff/me/events`
- `POST /tickets/validate`
- `POST /tickets/validate/image`

## Role-based access relationship

The system enforces separation of responsibility:

- Attendees cannot create or update events.
- Organizers cannot change admin-only roles.
- Check-in staff cannot manage other staff or edit event settings.
- Administrators can manage users and review the system, but the system still keeps organizer-level ownership rules in place for event operations.

This is enforced by `JwtAuthGuard` and `RolesGuard` in every protected controller.
