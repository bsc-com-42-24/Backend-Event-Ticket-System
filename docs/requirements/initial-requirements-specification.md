# Initial Requirements Specification

## 1. Introduction

### 1.1 Project Name

Ticket Master - Event Ticketing System

### 1.2 Project Description

Ticket Master is a backend event ticketing system that allows event managers to create and manage events, customers to discover events and purchase tickets, and authorized validators to validate tickets at event entry.

### 1.3 Technology Stack

- NestJS
- PostgreSQL
- Docker
- Swagger
- GitHub

---

## 2. Problem Statement

[Describe the problem the system is intended to solve.]

---

## 3. Project Objective

[Describe the main objective of Ticket Master.]

---

## 4. Project Scope

### 4.1 In Scope

[List the functions that will be implemented.]

### 4.2 Out of Scope

[List functions that are not part of the current project.]

---

## 5. Stakeholders

[List the people or groups affected by or interested in the system.]

---

## 6. System Actors

### 6.1 Customer

[Responsibilities and permissions.]

### 6.2 Event Manager

[Responsibilities and permissions.]

### 6.3 Validator

[Responsibilities and permissions.]

### 6.4 Administrator

[Responsibilities and permissions.]

---

# 7. Functional Requirements

## 7.1 Authentication and User Management

Member 2 contribution

- A user's email address shall be unique.
- Passwords shall not be stored as plain text.
- A user must provide valid credentials to authenticate.
- Protected operations require authentication.
- Access to protected operations shall depend on the user's assigned role.
- Users shall not be allowed to change their role through normal customer operations.
- Invalid authentication credentials shall not result in successful login.

## 7.2 Event Management

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

## 7.3 Event Capacity and Availability

[Member 3 contribution]
Functional requirements
ID	Requirement
FR-CAP-01	The system shall store the maximum ticket capacity for each event.
FR-CAP-02	The system shall track the number of tickets issued for an event.
FR-CAP-03	The system shall provide remaining ticket availability.
FR-CAP-04	The system shall prevent ticket purchases when event capacity has been reached.
FR-CAP-05	The system shall maintain correct capacity when multiple customers purchase tickets at the same time.
FR-CAP-06	The system shall not allow remaining availability to become negative.

## 7.4 Ticket Purchase

[Member 4 contribution]

## 7.5 Ticket and QR Management

[Member 4 contribution]

## 7.6 Ticket Validation

[Member 5 contribution]

## 7.7 API Documentation

[Member 5 contribution]

---

# 8. Non-Functional Requirements

## 8.1 Security

[Member 2 contribution]

## 8.2 Performance

[Team contribution]

## 8.3 Reliability

[Member 5 contribution]

## 8.4 Data Integrity

[Member 3 and Member 4 contribution]

## 8.5 Maintainability

[Member 1 contribution]

## 8.6 Scalability

[Team contribution]

## 8.7 Usability

[Team contribution]

## 8.8 Documentation

[Member 5 contribution]

## 8.9 Deployment

[Member 5 contribution]

---

# 9. Use Cases

## 9.1 User Registration
Actor: Customer, Event Manager, Validator or Administrator

Description: 
The user provides the required registration information. The system validates the information, checks whether the email is already registered, securely stores the password and creates the user account.

Expected Result:
A new user account is successfully created.

## 9.2 User Login

Actor: Registered User

Description:  
The user provides their email and password. The system verifies the credentials and, if valid, generates an authentication token.

Expected Result:  
The user is authenticated and receives a JWT that can be used to access authorized protected endpoints.

## 9.3 Create Event

## 9.4 Publish Event

## 9.5 Browse Events

## 9.6 Purchase Ticket

## 9.7 View Ticket

## 9.8 Validate Ticket

## 9.9 Reject Invalid Ticket

---

# 10. Business Rules

### Authentication and User Rules

- A user's email address shall be unique.
- Passwords shall not be stored as plain text.
- A user must provide valid credentials to authenticate.
- Protected operations require authentication.
- Access to protected operations shall depend on the user's assigned role.
- Users shall not be allowed to change their role through normal customer operations.
- Invalid authentication credentials shall not result in successful login.

---

# 11. Acceptance Criteria

[List the conditions that must be satisfied for the system to be considered complete.]

---

# 12. API Requirements

[List the main API endpoints required by the system.]

---

# 13. Database Requirements

[List the main data entities and relationships.]

---

# 14. Security Requirements

[List important security requirements.]

---

# 15. Testing Requirements

[List the testing requirements for the system.]

---

# 16. Deployment Requirements

[List Docker and deployment requirements.]

---

# 17. Requirements Traceability

[Link requirements to implementation, tests and acceptance criteria.]

---

# 18. Requirements Approval

| Member | Role | Contribution | Approval 
| Member 1 | Team Lead / Integration
| Member 2 | Authentication & Users
| Member 3 | Events & Capacity 
| Member 4 | Tickets & QR
| Member 5 | Validation / DevOps / Documentation 