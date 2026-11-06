# Ticket types, prices, and monitoring

The backend stores a price and currency for each ticket type and exposes those
values to the event browser. A manager can add, edit, or deactivate ticket
types. Configured type quantities cannot exceed event capacity and cannot be
reduced below tickets already sold or reserved.

The sales summary returns sold, reserved, remaining, inventory status, and
warnings. Stock at 10 or fewer tickets is marked `LOW_STOCK`; zero stock is
`SOLD_OUT`. The endpoint returns warnings for the frontend to display; it does
not send email, SMS, or push alerts.

**Paid checkout is not implemented.** The current ticket claim endpoint only
claims free tickets. It rejects a priced ticket rather than issuing it before
payment. Revenue is therefore reported as `null` until a payment provider and
order/payment records are implemented.

For endpoint paths and complete request examples, see
[the system flow and API guide](./PROJECT_FLOW_AND_API.md#pricing-ticket-types-and-monitoring).
