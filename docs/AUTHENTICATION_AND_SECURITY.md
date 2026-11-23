# Authentication and role management

The API uses bcrypt-hashed passwords and short-lived JWT bearer tokens.
Authorization uses the user's current role and active status from PostgreSQL
on each authenticated request, so changing a role or disabling an account
applies immediately to existing tokens.

## Public registration and login

`POST /auth/register` accepts attendees and organizers. If `role` is omitted,
the account is an attendee. `ADMIN` and `CHECK_IN_STAFF` are rejected; there
is no public administrator registration.

Attendee request:

```json
{
  "name": "Amina Banda",
  "email": "amina@example.com",
  "password": "a-long-unique-password",
  "role": "ATTENDEE"
}
```

Organizer request:

```json
{
  "name": "Event Organizer",
  "email": "organizer@example.com",
  "password": "a-long-unique-password",
  "role": "ORGANIZER"
}
```

Successful registration returns HTTP `201`:

```json
{
  "accessToken": "<signed JWT>",
  "tokenType": "Bearer"
}
```

The response contains no password or password hash. Organizer verification
status is managed separately through the organizer KYC workflow.

`POST /auth/login` uses the same email/password fields and returns the same
token response. Invalid credentials and disabled accounts return `401`.
Send the token on protected routes as:

```http
Authorization: Bearer <accessToken>
```

`GET /auth/me` returns the authenticated identity, for example:

```json
{
  "userId": "123",
  "email": "organizer@example.com",
  "role": "ORGANIZER"
}
```

## Check-in staff

An organizer creates a staff account on their own roster:

`POST /organizers/me/staff` (organizer bearer token)

```json
{
  "name": "Gate Staff",
  "email": "gate@example.com",
  "password": "a-long-unique-password"
}
```

An administrator can create staff for an existing active organizer:

`POST /admin/staff` (admin bearer token)

```json
{
  "organizerId": "123",
  "name": "Gate Staff",
  "email": "gate@example.com",
  "password": "a-long-unique-password"
}
```

Both routes return HTTP `201` with the staff profile, role
`CHECK_IN_STAFF`, active status, and current event assignments (initially an
empty list); they never return the password or hash. The staff member then
uses `POST /auth/login`. Organizers manage their own staff through
`GET /organizers/me/staff`, `PUT /organizers/me/staff/:staffId/events`,
`PATCH /organizers/me/staff/:staffId/active`, and
`DELETE /organizers/me/staff/:staffId`. Staff can validate tickets only for
assigned events. Admin-created staff are created on the selected organizer's
roster, rather than as unusable unassigned staff records.

Example creation response:

```json
{
  "staffId": "456",
  "name": "Gate Staff",
  "email": "gate@example.com",
  "role": "CHECK_IN_STAFF",
  "isActive": true,
  "createdAt": "2026-11-23T12:00:00.000Z",
  "events": []
}
```

`POST /users` is admin-only and can create managed `ATTENDEE`, `ORGANIZER`,
or `ADMIN` accounts. It cannot create check-in staff; use one of the roster
routes above. Admin role changes likewise cannot turn a non-staff account
into unowned check-in staff.

## Administrator bootstrap and recovery

Bootstrap is a local/operator CLI operation, not an HTTP endpoint. Build the
application, then provide `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`,
and `BOOTSTRAP_ADMIN_PASSWORD` in the process environment and run
`npm run admin:bootstrap`. Use a unique password with at least 12 characters
(maximum 72 UTF-8 bytes). Never put the password in source control or a
command-line argument.

For a local PowerShell setup after PostgreSQL is running and `.env` is
configured:

```powershell
npm run build
$env:BOOTSTRAP_ADMIN_NAME = Read-Host "Administrator name"
$env:BOOTSTRAP_ADMIN_EMAIL = Read-Host "Administrator email"
$securePassword = Read-Host "Administrator password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:BOOTSTRAP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  npm run admin:bootstrap
} finally {
  Remove-Item Env:\BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  $securePassword.Dispose()
}
```

In Docker, first rebuild/start the database and updated API image, then use
this in the same PowerShell session after setting the three environment
variables (use the secure password prompt above):

```powershell
docker compose run --rm -e BOOTSTRAP_ADMIN_NAME -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api npm run admin:bootstrap
```

Do not store the bootstrap password in `.env`; provide it only to the
one-off bootstrap process from a trusted operator shell or secret manager.

After bootstrap, sign in the same way as other users with
`POST /auth/login`:

```json
{
  "email": "admin@example.com",
  "password": "<the password entered at bootstrap>"
}
```

The login response is the standard bearer-token response shown above; use it
to call admin-only routes such as `GET /users`, `POST /admin/staff`, and
`GET /admin/events`.

The operation takes a PostgreSQL advisory lock and only proceeds when there
is no active administrator. It creates a new administrator or promotes and
resets the password of the matching email account, reactivating that account.
This supports first-admin setup and recovery when all admin accounts have
been disabled. If an active administrator exists, the operation refuses to
run. Only an operator trusted with database access should run it.

## Role boundaries

| Role | Main capabilities |
| --- | --- |
| `ATTENDEE` | Browse events, create orders, purchase/claim tickets, view own ticket history |
| `ORGANIZER` | Manage own events and tickets, submit KYC, manage own check-in staff and event assignments |
| `CHECK_IN_STAFF` | Validate tickets for events explicitly assigned by its organizer |
| `ADMIN` | Manage users, moderate events/KYC, and administer system operations |

Protected controllers use `JwtAuthGuard` and `RolesGuard`. Resource-level
ownership checks further restrict organizers to their own events and staff.
Unauthenticated requests receive `401`; authenticated users without the
required role receive `403`.

## Password, token, and configuration controls

- Passwords use bcrypt with 12 salt rounds. Passwords longer than bcrypt's
  72-byte input limit are rejected.
- `JWT_SECRET` is required and must be a private value of at least 32
  characters; the example placeholder is rejected.
- Database credentials are required environment variables; the example
  password placeholder is rejected. Do not copy production secrets into
  `.env.example`.
- TypeORM has `synchronize: false`; schema changes are applied through
  migrations. The SQL schema file is used only when PostgreSQL initializes a
  brand-new data volume.
- CORS origins are controlled by `CORS_ORIGINS`.
- File uploads, ticket validation, payment verification, and admin moderation
  have their own validation and authorization checks.

See [API documentation](./API_DOCUMENTATION.md) for the route catalog and
[installation and setup](./INSTALLATION_AND_SETUP.md) for environment and
Docker commands.
