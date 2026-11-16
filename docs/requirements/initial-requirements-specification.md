# Ticket Master Requirements Specification



## Project description

Ticket Master is a backend event ticketing system that allows event managers to create and manage events, customers to discover events and purchase tickets, and authorized validators to validate tickets at event entry.

## Technology stack

- NestJS
- PostgreSQL
- Docker
- Swagger
- GitHub


# Functional requirements

##  Authentication and User Management

- A user's email address shall be unique.
- Passwords shall not be stored as plain text.
- A user must provide valid credentials to authenticate.
- Protected operations require authentication.
- Access to protected operations shall depend on the user's assigned role.
- Users shall not be allowed to change their role through normal customer operations.
- Invalid authentication credentials shall not result in successful login.

##  Event Management

ID	Requirement
FR-EVENT-01	The system shall allow an authorized Event Manager to create an event.
FR-EVENT-02	The system shall require essential event information such as title, description, venue/location, dates and capacity.
FR-EVENT-03	The system shall allow an authorized Event Manager to view events they manage.
FR-EVENT-04	The system shall make published events available for customer discovery.
FR-EVENT-04a	The system shall let customers search published events by keyword, name, venue, or location.
FR-EVENT-05	The system shall allow users to view event details.
FR-EVENT-06	The system shall allow an authorized Event Manager to update an event.
FR-EVENT-07	The system shall allow an authorized Event Manager to cancel an event.
FR-EVENT-08	The system shall publish an event when its status is set to PUBLISHED during creation or update; no separate publish endpoint is required.
FR-EVENT-09	The system shall prevent unauthorized users from managing events.
FR-EVENT-10	The system shall support DRAFT, PUBLISHED and CANCELLED event statuses.

##  Event Capacity and Availability

Functional requirements
ID	Requirement
FR-CAP-01	The system shall store the maximum ticket capacity for each event.
FR-CAP-02	The system shall track the number of tickets issued for an event.
FR-CAP-03	The system shall provide remaining ticket availability.
FR-CAP-04	The system shall prevent ticket purchases when event capacity has been reached.
FR-CAP-05	The system shall maintain correct capacity when multiple customers purchase tickets at the same time.
FR-CAP-06	The system shall not allow remaining availability to become negative.

## Ticket Purchase

The system shall allow an authenticated customer to claim an eligible free
ticket or a paid ticket after payment is verified.
The system shall verify that the requested event exists.
The system shall verify that the event is available for ticket sales.
The system shall verify that capacity is available before creating a ticket.
The system shall associate each ticket with the customer who purchased it.
The system shall associate each ticket with the selected event.
The system shall generate a unique and secure ticket identifier.
The system shall assign the correct initial ticket status after successful purchase.
The system shall return relevant ticket details after successful purchase.
The system shall not create a ticket when the event has reached capacity.

Paid ticket types require a verified PayChangu transaction before tickets are
assigned. Free ticket claims do not require a payment reference.

##  Ticket and QR Management

The system shall provide a QR-code representation for a valid ticket.
The QR code shall represent a secure ticket identifier or server-verifiable value.
The system shall allow customers to retrieve their tickets.
The system shall allow authorized customers to view ticket details.
The system shall support ticket statuses such as ACTIVE, USED, CANCELLED and EXPIRED where applicable.
The system shall record the time a ticket was issued.
The system shall record the time a ticket was used when validation succeeds.

## Ticket validation

The system shall accept a QR payload or ticket number for validation.
Administrators may validate any ticket. Organizers may validate tickets for
their events. Check-in staff may validate tickets only for events assigned by
their organizer. A ticket shall be accepted at most once, and each attempt
shall be recorded.

## API documentation

The system shall document its routes, request fields, response formats,
authentication requirements, and role restrictions in Swagger.

---

#  Non-Functional Requirements

##  Security

NFR-001 Security: authentication, authorization, password hashing and protected secrets

##  Performance

NFR-009 Performance: normal API operations should respond efficiently under expected project loads

##  Reliability

NFR-003 Reliability: validation must produce deterministic results and prevent duplicate entry

##  Data Integrity

NFR-002 Data integrity: ticket issuance must respect event capacity

##  Maintainability

NFR-004 Maintainability: modular NestJS architecture and readable code

##  Scalability

The system shall support growth in events, ticket types, and attendee
requests within the expected project workload.

##  Usability

The API shall return clear validation and authorization errors.

##  Documentation

The API documentation shall match the implemented routes and behavior.

##  Deployment

The system shall support local deployment with Docker Compose and provide
environment-based configuration for deployment.
