import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import { Ticket } from './entities/ticket.entity';
import { TicketValidationReason } from './enums/ticket-validation-reason.enum';
import { QrCodeService } from './qr-code/qr-code.service';

interface TicketForValidation {
  ticket_id: string;
  event_id: string;
  ticket_status: string;
  event_status: string;
}

export type TicketValidationResult =
  | {
      accepted: true;
      reason: null;
      ticketId: string;
      eventId: string;
      validatedAt: Date;
    }
  | {
      accepted: false;
      reason: TicketValidationReason;
      ticketId: string | null;
      eventId: string | null;
      validatedAt: null;
    };

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly qrCodeService: QrCodeService,
    private readonly dataSource: DataSource,
  ) {}

  async purchaseTicket(userId: string, eventId: string, ticketTypeId: string) {
    return this.dataSource.transaction(async (m) => {
      const ticketTypes = await m.query(
        `SELECT ticket_type_id, quantity_sold, quantity_reserved, quantity_total, is_active
         FROM ticket_types WHERE ticket_type_id = $1 AND event_id = $2 FOR UPDATE`,
        [ticketTypeId, eventId],
      );
      const ticketType = ticketTypes[0];

      if (!ticketType || !ticketType.is_active) {
        throw new NotFoundException('Ticket type unavailable');
      }

      if (ticketType.quantity_sold + ticketType.quantity_reserved >= ticketType.quantity_total) {
        throw new BadRequestException('Tickets are sold out');
      }

      const ticketNumber = `TKT-${randomBytes(5).toString('hex').toUpperCase()}`;
      const qrToken = randomUUID();

      await m.query(
        `INSERT INTO tickets (ticket_number, event_id, ticket_type_id, customer_id, qr_token, status)
         VALUES ($1, $2, $3, $4, $5, 'ISSUED')`,
        [ticketNumber, eventId, ticketTypeId, userId, qrToken],
      );

      await m.query(
        `UPDATE ticket_types SET quantity_sold = quantity_sold + 1 WHERE ticket_type_id = $1`,
        [ticketTypeId],
      );

      await m.query(
        `UPDATE events SET tickets_issued = tickets_issued + 1 WHERE event_id = $1`,
        [eventId],
      );

      const qrCodeDataUrl = await this.qrCodeService.generateQrCode(qrToken);

      return {
        ticketNumber,
        qrToken,
        qrCodeDataUrl,
        status: 'ISSUED',
      };
    });
  }

  async getCustomerBuyingHistory(userId: string) {
    return this.dataSource.query(
      `SELECT t.ticket_id, t.ticket_number, t.status, t.issued_at, 
              e.title as event_title, e.start_at, tt.type_name, tt.price, tt.currency
       FROM tickets t
       JOIN events e ON t.event_id = e.event_id
       JOIN ticket_types tt ON t.ticket_type_id = tt.ticket_type_id
       WHERE t.customer_id = $1
       ORDER BY t.issued_at DESC`,
      [userId],
    );
  }

  async verifyScannedQr(qrToken: string, staffUserId: string) {
    const records = await this.dataSource.query(
      `SELECT t.ticket_id, t.ticket_number, t.status as ticket_status, 
              u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone,
              e.title as event_title, e.status as event_status
       FROM tickets t
       JOIN users u ON t.customer_id = u.user_id
       JOIN events e ON t.event_id = e.event_id
       WHERE t.qr_token = $1`,
      [qrToken],
    );

    const ticket = records[0];
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.ticket_status === 'USED') {
      await this.logValidation(ticket.ticket_id, staffUserId, 'REJECTED', 'ALREADY_USED');
      return { result: 'REJECTED', reason: 'ALREADY_USED', ticketDetails: ticket };
    }

    if (ticket.ticket_status === 'CANCELLED' || ticket.event_status === 'CANCELLED') {
      await this.logValidation(ticket.ticket_id, staffUserId, 'REJECTED', 'CANCELLED');
      return { result: 'REJECTED', reason: 'CANCELLED', ticketDetails: ticket };
    }

    await this.dataSource.transaction(async (m) => {
      await m.query(
        `UPDATE tickets SET status = 'USED', checked_in_at = CURRENT_TIMESTAMP WHERE ticket_id = $1`,
        [ticket.ticket_id],
      );
      await m.query(
        `INSERT INTO ticket_validations (ticket_id, checked_by, result) VALUES ($1, $2, 'ACCEPTED')`,
        [ticket.ticket_id, staffUserId],
      );
    });

    return {
      result: 'ACCEPTED',
      message: 'Check-in validated successfully',
      customer: {
        name: ticket.customer_name,
        email: ticket.customer_email,
        phone: ticket.customer_phone,
      },
      ticket: {
        number: ticket.ticket_number,
        status: 'USED',
      },
      event: {
        title: ticket.event_title,
      },
    };
  }

  private async logValidation(ticketId: string, staffId: string, result: string, reason: string) {
    await this.dataSource.query(
      `INSERT INTO ticket_validations (ticket_id, checked_by, result, reason) VALUES ($1, $2, $3, $4)`,
      [ticketId, staffId, result, reason],
    );
  }

  async generateTickets(eventId: string, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (m) => {
      const events = await m.query(
        `SELECT event_id, organizer_id, status, capacity, tickets_issued
         FROM events WHERE event_id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (
        !event ||
        (String(event.organizer_id) !== String(user.userId) &&
          user.role !== UserRole.ADMIN)
      ) {
        throw new NotFoundException('Event not found');
      }
      if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
        throw new ConflictException(
          `Cannot generate tickets for a ${event.status} event`,
        );
      }

      const types = await m.query(
        `SELECT ticket_type_id, type_name, quantity_total
         FROM ticket_types
         WHERE event_id = $1 AND is_active = TRUE
         ORDER BY ticket_type_id
         FOR UPDATE`,
        [eventId],
      );
      if (types.length === 0) {
        throw new ConflictException(
          'Create at least one active ticket type before generating tickets',
        );
      }

      const counts = await m.query(
        `SELECT ticket_type_id, COUNT(*)::int AS n
         FROM tickets WHERE event_id = $1
         GROUP BY ticket_type_id`,
        [eventId],
      );
      const existing = new Map(counts.map((c: any) => [String(c.ticket_type_id), c.n]));

      const plan = types.map((t: any) => {
        const have = existing.get(String(t.ticket_type_id)) ?? 0;
        return {
          ticketTypeId: t.ticket_type_id,
          typeName: t.type_name,
          toCreate: Math.max(0, t.quantity_total - have),
          totalAfter: Math.max(have, t.quantity_total),
        };
      });
      const totalNew = plan.reduce((sum: number, p: any) => sum + p.toCreate, 0);

      if (event.tickets_issued + totalNew > event.capacity) {
        throw new ConflictException(
          `Generating ${totalNew} more tickets would exceed the event capacity ` +
            `(${event.tickets_issued} already issued, capacity ${event.capacity})`,
        );
      }

      for (const p of plan) {
        if (p.toCreate === 0) continue;
        const numbers: string[] = [];
        const tokens: string[] = [];
        for (let i = 0; i < p.toCreate; i++) {
          numbers.push(`TKT-${randomBytes(5).toString('hex').toUpperCase()}`);
          tokens.push(randomUUID());
        }
        await m.query(
          `INSERT INTO tickets (ticket_number, event_id, ticket_type_id, qr_token)
           SELECT t.n, $3::bigint, $4::bigint, t.q
           FROM unnest($1::text[], $2::uuid[]) AS t(n, q)`,
          [numbers, tokens, eventId, p.ticketTypeId],
        );
      }

      if (totalNew > 0) {
        await m.query(
          `UPDATE events
           SET tickets_issued = tickets_issued + $1, updated_at = CURRENT_TIMESTAMP
           WHERE event_id = $2`,
          [totalNew, eventId],
        );
      }

      return {
        eventId,
        capacity: event.capacity,
        ticketsIssued: event.tickets_issued + totalNew,
        newlyCreated: totalNew,
        ticketTypes: plan.map((p: any) => ({
          ticketTypeId: p.ticketTypeId,
          typeName: p.typeName,
          created: p.toCreate,
          total: p.totalAfter,
        })),
      };
    });
  }

  async findByEvent(eventId: string, user: AuthenticatedUser) {
    await this.assertCanManageEvent(eventId, user, 'Event not found');
    return this.ticketRepository.find({
      where: { eventId },
      order: { id: 'ASC' },
    });
  }

  async getTicket(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.ticketRepository.findOne({
      where: { ticketNumber },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    await this.assertCanManageEvent(ticket.eventId, user, 'Ticket not found');
    return ticket;
  }

  async getTicketWithQrCode(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.getTicket(ticketNumber, user);
    const qrCode = await this.qrCodeService.generateQrCode(ticket.qrToken);
    return { ticket, qrCode };
  }

  private async assertCanManageEvent(
    eventId: string,
    user: AuthenticatedUser,
    notFoundMessage: string,
  ): Promise<void> {
    const rows = await this.dataSource.query(
