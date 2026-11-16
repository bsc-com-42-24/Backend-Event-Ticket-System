# Ticket types, prices, and monitoring

The backend stores a price and currency for each ticket type and exposes those
values to the event browser. A manager can add, edit, or deactivate ticket
types. Configured type quantities cannot exceed event capacity and cannot be
reduced below tickets already sold or reserved.

The sales summary returns sold, reserved, remaining, inventory status, and
warnings. Stock at 10 or fewer tickets is marked `LOW_STOCK`; zero stock is
`SOLD_OUT`. The endpoint returns warnings for the frontend to display; it does
not send email, SMS, or push alerts.

The ticket claim endpoint supports paid tickets when PayChangu is configured.
For a paid ticket, include the transaction reference in `POST /tickets/purchase`.
The backend verifies the payment with the provider before assigning tickets.
Free ticket claims do not need a transaction reference. A browser redirect
alone does not confirm payment.

The sales summary does not calculate revenue from ticket counts. It currently
reports payment tracking as `NOT_CONFIGURED`.
For endpoint paths and request examples, see
[the system flow and API guide](./PROJECT_FLOW_AND_API.md#tickets-and-check-in).
