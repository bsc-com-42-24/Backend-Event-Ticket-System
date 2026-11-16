# Project Overview

Ticket Master is a backend event ticketing system built with NestJS and PostgreSQL. It supports event creation, ticket management, customer ticket purchase, QR validation, and organizer/admin moderation workflows.

## Problem statement

Event organizers need a reliable way to manage event listings, ticket inventory, and access control without manual spreadsheet work. Attendees need a simple way to discover events and claim valid tickets. Check-in staff need to validate tickets quickly and accurately while preventing duplicate entries.

## Project objectives

- Allow organizers to create and manage events and ticket types.
- Provide public event discovery for published events.
- Support ticket issuance, payment verification, and assignment to customers.
- Prevent duplicate or invalid ticket scans.
- Enforce role-based access for attendees, organizers, staff, and administrators.
- Keep core business rules in the backend and database.

## Scope of the system

The system covers:

- User registration, authentication, and role assignment.
- Event creation, update, cancellation, and public browsing.
- Ticket type creation, pricing, sales windows, and inventory tracking.
- Ticket generation and purchase.
- QR code generation and validation.
- Organizer-managed check-in staff assignment.
- Admin moderation for events, organizer KYC, and audit logs.
- Support for PayChangu verification flow for paid tickets.

The project is a backend service only. There is no frontend application in this repository.

## Main features

- Public event listing and event detail lookup.
- Organizer-managed event lifecycle with DRAFT, PUBLISHED, and CANCELLED states.
- Ticket types with price, currency, quantity, and per-order limits.
- Stock reservation, inventory safety checks, and event capacity enforcement.
- Customer ticket history and QR code retrieval.
- Ticket validation by QR payload, ticket number, or uploaded QR image.
- Organizer-managed check-in staff and event assignment.
- Admin moderation of events and KYC reviews.
- Swagger documentation for API consumers.

## Intended users

### Attendees
Use the system to browse events and purchase tickets for themselves.

### Organizers
Manage event content, ticket types, inventory, sales, and assigned check-in staff.

### Check-in staff
Validate tickets for approved events and prevent duplicate check-ins.

### Administrators
Moderate events, review organizer KYC, view audit logs, and manage system-wide user roles.
