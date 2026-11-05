import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class TicketPurchaseService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * A customer buys one ticket of a ticket type of an event.
   * The ticket is generated here, at purchase time, and capacity and
   * ticket-type stock are checked while the rows are locked.
   */
  async purchase(
    eventId: string,
    ticketTypeId: string,
    user: AuthenticatedUser,
  ) {
    return this.dataSource.transaction(async (m) => {
      // 1. Lock the event
      const events: {
        event_id: string;
        title: string;
        status: string;
        capacity: number;
        tickets_issued: number;
      }[] = await m.query(
        `SELECT event_id, title, status, capacity, tickets_issued
         FROM events WHERE event_id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event) {
        throw new NotFoundException('The requested event does not exist');
      }
      if (event.status !== 'PUBLISHED') {
        throw new ConflictException(
          'Tickets can only be bought for published events',
        );
      }

      // 2. Lock the ticket type; it must belong to this event
      const types: {
        ticket_type_id: string;
        type_name: string;
        quantity_total: number;
        sales_start_at: Date | null;
        sales_end_at: Date | null;
      }[] = await m.query(
        `SELECT ticket_type_id, type_name, quantity_total,
                sales_start_at, sales_end_at
         FROM ticket_types
         WHERE ticket_type_id = $1 AND event_id = $2 AND is_active = TRUE
         FOR UPDATE`,
        [ticketTypeId, eventId],
      );
      const ticketType = types[0];
      if (!ticketType) {
        throw new NotFoundException(
          'This ticket type does not exist for the selected event',
        );
      }

      const now = new Date();
      if (
        (ticketType.sales_start_at && now < ticketType.sales_start_at) ||
        (ticketType.sales_end_at && now > ticketType.sales_end_at)
      ) {
        throw new BadRequestException('Ticket sales are not open');
      }

      // 3. Stock and capacity
      const counts: { count: string }[] = await m.query(
        `SELECT COUNT(*)::text AS count FROM tickets WHERE ticket_type_id = $1`,
        [ticketTypeId],
      );
      const sold = parseInt(counts[0]?.count ?? '0', 10);
      if (sold >= ticketType.quantity_total) {
        throw new ConflictException('This ticket type is sold out');
      }
      if (event.tickets_issued + 1 > event.capacity) {
        throw new ConflictException('The event is at maximum capacity');
      }

      // 4. Generate the ticket
      const ticketNumber = `TKT-${randomBytes(5).toString('hex').toUpperCase()}`;
      const qrToken = randomUUID();

      const inserted: {
        ticket_number: string;
        qr_token: string;
        status: string;
        issued_at: Date;
      }[] = await m.query(
        `INSERT INTO tickets
           (ticket_number, event_id, ticket_type_id, qr_token, customer_id, status)
         VALUES ($1, $2::bigint, $3::bigint, $4::uuid, $5::bigint, 'ISSUED')
         RETURNING ticket_number, qr_token, status, issued_at`,
        [ticketNumber, eventId, ticketTypeId, qrToken, user.userId],
      );

      await m.query(
        `UPDATE events
         SET tickets_issued = tickets_issued + 1, updated_at = CURRENT_TIMESTAMP
         WHERE event_id = $1`,
        [eventId],
      );
      await m.query(
        `UPDATE ticket_types
         SET quantity_sold = quantity_sold + 1
         WHERE ticket_type_id = $1`,
        [ticketTypeId],
      );

      const ticket = inserted[0];
      return {
        ticketNumber: ticket.ticket_number,
        qrToken: ticket.qr_token,
        status: ticket.status,
        issuedAt: ticket.issued_at,
        eventId,
        eventTitle: event.title,
        ticketTypeId,
        ticketType: ticketType.type_name,
      };
    });
  }
}