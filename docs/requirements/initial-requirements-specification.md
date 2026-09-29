# Initial Requirements Specification



###  Project Description

Ticket Master is a backend event ticketing system that allows event managers to create and manage events, customers to discover events and purchase tickets, and authorized validators to validate tickets at event entry.

###  Technology Stack

- NestJS
- PostgreSQL
- Docker
- Swagger
- GitHub


#  Functional Requirements

##  Authentication and User Management

Member 2 contribution

- A user's email address shall be unique.
- Passwords shall not be stored as plain text.
- A user must provide valid credentials to authenticate.
- Protected operations require authentication.
- Access to protected operations shall depend on the user's assigned role.
- Users shall not be allowed to change their role through normal customer operations.
- Invalid authentication credentials shall not result in successful login.

##  Event Management

[Member 3 contribution]

ID	Requirement
FR-EVENT-01	The system shall allow an authorized Event Manager to create an event.
FR-EVENT-02	The system shall require essential event information such as title, description, venue/location, dates and capacity.
FR-EVENT-03	The system shall allow an authorized Event Manager to view events they manage.
FR-EVENT-04	The system shall make published events available for customer discovery.
FR-EVENT-05	The system shall allow users to view event details.
FR-EVENT-06	The system shall allow an authorized Event Manager to update an event.
FR-EVENT-07	The system shall allow an authorized Event Manager to cancel an event.
FR-EVENT-08	The system shall allow an authorized Event Manager to publish an event.
FR-EVENT-09	The system shall prevent unauthorized users from managing events.
FR-EVENT-10	The system shall support DRAFT, PUBLISHED and CANCELLED event statuses.

##  Event Capacity and Availability

[Member 3 contribution]
Functional requirements
ID	Requirement
FR-CAP-01	The system shall store the maximum ticket capacity for each event.
FR-CAP-02	The system shall track the number of tickets issued for an event.
FR-CAP-03	The system shall provide remaining ticket availability.
FR-CAP-04	The system shall prevent ticket purchases when event capacity has been reached.
FR-CAP-05	The system shall maintain correct capacity when multiple customers purchase tickets at the same time.
FR-CAP-06	The system shall not allow remaining availability to become negative.

## Ticket Purchase

[Member 4 contribution]
The system shall allow an authenticated customer to purchase a ticket for an eligible event.
The system shall verify that the requested event exists.
The system shall verify that the event is available for ticket sales.
The system shall verify that capacity is available before creating a ticket.
The system shall associate each ticket with the customer who purchased it.
The system shall associate each ticket with the selected event.
The system shall generate a unique and secure ticket identifier.
The system shall assign the correct initial ticket status after successful purchase.
The system shall return relevant ticket details after successful purchase.
The system shall not create a ticket when the event has reached capacity.

##  Ticket and QR Management

[Member 4 contribution]
The system shall provide a QR-code representation for a valid ticket.
The QR code shall represent a secure ticket identifier or server-verifiable value.
The system shall allow customers to retrieve their tickets.
The system shall allow authorized customers to view ticket details.
The system shall support ticket statuses such as ACTIVE, USED, CANCELLED and EXPIRED where applicable.
The system shall record the time a ticket was issued.
The system shall record the time a ticket was used when validation succeeds.

##  Ticket Validation

[Member 5 contribution]

##  API Documentation

[Member 5 contribution]

---

#  Non-Functional Requirements

##  Security

[Member 2 contribution]

##  Performance

[Team contribution]

##  Reliability

[Member 5 contribution]

##  Data Integrity

[Member 3 and Member 4 contribution]

##  Maintainability

[Member 1 contribution]

##  Scalability

[Team contribution]

##  Usability

[Team contribution]

##  Documentation

[Member 5 contribution]

##  Deployment

[Member 5 contribution]

