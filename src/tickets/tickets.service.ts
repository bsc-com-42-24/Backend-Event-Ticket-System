import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
  ticket_number: string;
  event_id: string;
  ticket_status: string;
  checked_in_at: Date | null;
  event_status: string;
  organizer_id: string;
  event_title: string;
  event_venue: string | null;
  event_location: string | null;
  event_start_at: Date;
  event_end_at: Date;
  ticket_type_name: string;
  owner_name: string;
}

interface UpdatedTicket {
  ticket_id: string;
  event_id: string;
  checked_in_at: Date;
}

interface TicketValidationTicket {
  id: string;
  ticketNumber: string;
  status: string;
  checkedInAt: Date | null;
  ticketType: string;
  ownerName: string;
}

interface TicketValidationEvent {
  id: string;
  title: string;
  venue: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
}

export type TicketValidationResult =
  | {
      accepted: true;
      reason: null;
      message: string;
      ticketId: string;
      eventId: string;
      validatedAt: Date;
      ticket: TicketValidationTicket;
      event: TicketValidationEvent;
    }
  | {
      accepted: false;
      reason: TicketValidationReason;
      message: string;
      ticketId: string | null;
      eventId: string | null;
      validatedAt: null;
      ticket: TicketValidationTicket | null;
      event: TicketValidationEvent | null;
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

  /** Tickets owned by the logged-in user. */
  async findMine(user: AuthenticatedUser) {
    return this.ticketRepository.find({
      where: { ownerId: user.userId },
      order: { issuedAt: 'DESC' },
    });
  }

  /** One ticket, visible to its owner or an admin. Others get a 404. */
  async getTicket(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.ticketRepository.findOne({
      where: { ticketNumber },
    });
    if (
      !ticket ||
      (ticket.ownerId !== user.userId && user.role !== UserRole.ADMIN)
    ) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  /** Ticket plus a QR code (PNG data URL) that encodes the secret qr_token. */
  async getTicketWithQrCode(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.getTicket(ticketNumber, user);
    const qrCode = await this.qrCodeService.generateQrCode(ticket.qrToken);
    return { ticket, qrCode };
  }

  async validateTicketImage(
    image: Buffer,
    validatorId: string,
    attemptedEventId?: string,
    validatorRole?: UserRole,
  ): Promise<TicketValidationResult> {
    const qrToken = await this.qrCodeService.decodeQrCode(image);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        qrToken,
      )
    ) {
      throw new BadRequestException(
        'The QR code does not contain a valid ticket token.',
      );
    }

    return this.validateTicket(
      qrToken,
      validatorId,
      attemptedEventId,
      undefined,
      validatorRole,
    );
  }

  async validateTicket(
    qrToken: string | undefined,
    validatorId: string,
    attemptedEventId?: string,
    ticketNumber?: string,
    validatorRole?: UserRole,
  ): Promise<TicketValidationResult> {
    if (Boolean(qrToken) === Boolean(ticketNumber)) {
      throw new BadRequestException(
        'Provide exactly one of qrToken or ticketNumber',
      );
    }

    const lookupValue = qrToken || ticketNumber;
    if (!lookupValue) {
      throw new BadRequestException(
        'Provide exactly one of qrToken or ticketNumber',
      );
    }
    const lookupColumn = qrToken ? 't.qr_token' : 't.ticket_number';
    const result = await this.dataSource.transaction(async (manager) => {
      const tickets: TicketForValidation[] = await manager.query(
        `SELECT t.ticket_id, t.ticket_number, t.event_id,
                t.status AS ticket_status, t.checked_in_at,
                e.status AS event_status, e.organizer_id,
                e.title AS event_title, e.venue AS event_venue,
                e.location AS event_location, e.start_at AS event_start_at,
                e.end_at AS event_end_at, tt.type_name AS ticket_type_name,
                u.full_name AS owner_name
         FROM tickets t
         JOIN events e ON e.event_id = t.event_id
         JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
         JOIN users u ON u.user_id = t.owner_id
         WHERE ${lookupColumn} = $1
         FOR UPDATE OF t, e`,
        [lookupValue],
      );

      const ticket = tickets[0];
      if (!ticket) {
        return this.rejected(TicketValidationReason.NOT_FOUND);
      }
      if (
        validatorRole === UserRole.EVENT_MANAGER &&
        ticket.organizer_id !== validatorId
      ) {
        throw new NotFoundException('Ticket not found');
      }
      if (ticket.ticket_status === 'USED') {
        return this.rejected(TicketValidationReason.ALREADY_USED, ticket);
      }
      if (
        ticket.ticket_status === 'CANCELLED' ||
        ticket.ticket_status === 'REFUNDED'
      ) {
        return this.rejected(TicketValidationReason.CANCELLED, ticket);
      }
      if (ticket.event_status === 'CANCELLED') {
        return this.rejected(TicketValidationReason.EVENT_CANCELLED, ticket);
      }
      if (attemptedEventId && attemptedEventId !== ticket.event_id) {
        return this.rejected(TicketValidationReason.WRONG_EVENT, ticket);
      }

      const updatedTickets: UpdatedTicket[] = await manager.query(
        `UPDATE tickets
         SET status = 'USED', checked_in_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND status = 'ISSUED'
         RETURNING ticket_id, event_id, checked_in_at`,
        [ticket.ticket_id],
      );
      const updated = updatedTickets[0];
      if (!updated) {
        return this.rejected(TicketValidationReason.ALREADY_USED, {
          ...ticket,
          ticket_status: 'USED',
        });
      }

      return {
        accepted: true as const,
        reason: null,
        message: 'Ticket accepted. Admit guest.',
        ticketId: updated.ticket_id,
        eventId: updated.event_id,
        validatedAt: updated.checked_in_at,
        ticket: this.toValidationTicket(ticket, 'USED', updated.checked_in_at),
        event: this.toValidationEvent(ticket),
      };
    });

    await this.recordValidation(result, validatorId, attemptedEventId);
    return result;
  }

  async getCheckInSummary(
    eventId: string,
    user: AuthenticatedUser,
  ): Promise<{
    eventId: string;
    eventTitle: string;
    ticketsIssued: number;
    checkedIn: number;
    remaining: number;
  }> {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.EVENT_MANAGER
    ) {
      throw new ForbiddenException(
        'Only event managers and administrators can view check-in progress',
      );
    }

    const rows = await this.dataSource.query(
      `SELECT e.event_id, e.title,
              COUNT(t.ticket_id)::int AS tickets_issued,
              COUNT(t.ticket_id) FILTER (WHERE t.status = 'USED')::int AS checked_in
       FROM events e
       LEFT JOIN tickets t
         ON t.event_id = e.event_id
        AND t.status IN ('ISSUED', 'USED')
       WHERE e.event_id = $1
         AND ($2 = 'ADMIN' OR e.organizer_id = $3)
       GROUP BY e.event_id, e.title`,
      [eventId, user.role, user.userId],
    );
    const summary = rows[0];
    if (!summary) throw new NotFoundException('Event not found');

    return {
      eventId: summary.event_id,
      eventTitle: summary.title,
      ticketsIssued: summary.tickets_issued,
      checkedIn: summary.checked_in,
      remaining: summary.tickets_issued - summary.checked_in,
    };
  }

  private rejected(
    reason: TicketValidationReason,
    ticket?: TicketForValidation,
  ): TicketValidationResult {
    const messages: Record<TicketValidationReason, string> = {
      [TicketValidationReason.NOT_FOUND]: 'Ticket not found.',
      [TicketValidationReason.ALREADY_USED]:
        'This ticket has already been used.',
      [TicketValidationReason.CANCELLED]:
        'This ticket is cancelled or refunded.',
      [TicketValidationReason.WRONG_EVENT]:
        'This ticket is for a different event.',
      [TicketValidationReason.EVENT_CANCELLED]:
        'This event has been cancelled.',
    };
    return {
      accepted: false,
      reason,
      message: messages[reason],
      ticketId: ticket?.ticket_id ?? null,
      eventId: ticket?.event_id ?? null,
      validatedAt: null,
      ticket: ticket ? this.toValidationTicket(ticket) : null,
      event: ticket ? this.toValidationEvent(ticket) : null,
    };
  }

  private toValidationTicket(
    ticket: TicketForValidation,
    status = ticket.ticket_status,
    checkedInAt = ticket.checked_in_at,
  ): TicketValidationTicket {
    return {
      id: ticket.ticket_id,
      ticketNumber: ticket.ticket_number,
      status,
      checkedInAt,
      ticketType: ticket.ticket_type_name,
      ownerName: ticket.owner_name,
    };
  }

  private toValidationEvent(
    ticket: TicketForValidation,
  ): TicketValidationEvent {
    return {
      id: ticket.event_id,
      title: ticket.event_title,
      venue: ticket.event_venue,
      location: ticket.event_location,
      startAt: ticket.event_start_at,
      endAt: ticket.event_end_at,
      status: ticket.event_status,
    };
  }

  private async recordValidation(
    result: TicketValidationResult,
    validatorId: string,
    attemptedEventId?: string,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO ticket_validations
           (ticket_id, checked_by, attempted_event_id, result, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result.ticketId,
          validatorId,
          attemptedEventId ?? null,
          result.accepted ? 'ACCEPTED' : 'REJECTED',
          result.reason,
        ],
      );
    } catch (error) {
      this.logger.error(
        'Failed to record ticket validation attempt',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Temporary payment step: PENDING -> PAID, stock moves from reserved to sold,
   * and one ticket row is issued per purchased seat. All in one transaction.
   */
  async payOrder(orderId: number) {
    return this.dataSource.transaction(async (m) => {
      const orders = await m.query(
        `SELECT order_id, buyer_id, status, expires_at
         FROM orders WHERE order_id = $1 FOR UPDATE`,
        [orderId],
      );
      if (orders.length === 0) throw new NotFoundException('Order not found');

      const order = orders[0];
      if (order.status !== 'PENDING') {
        throw new ConflictException(
          `Order is ${order.status}; only PENDING orders can be paid`,
        );
      }
      if (order.expires_at && new Date(order.expires_at) < new Date()) {
        throw new ConflictException('Order has expired');
      }

      const items = await m.query(
        `SELECT oi.order_item_id, oi.ticket_type_id, oi.quantity, tt.event_id
         FROM order_items oi
         JOIN ticket_types tt ON tt.ticket_type_id = oi.ticket_type_id
         WHERE oi.order_id = $1`,
        [orderId],
      );

      const issued: { ticket_id: string; ticket_number: string }[] = [];

      for (const item of items) {
        const [moved] = await m.query(
          `UPDATE ticket_types
           SET quantity_reserved = quantity_reserved - $1,
               quantity_sold = quantity_sold + $1
           WHERE ticket_type_id = $2 AND quantity_reserved >= $1
           RETURNING ticket_type_id`,
          [item.quantity, item.ticket_type_id],
        );
        if (moved.length === 0) {
          throw new ConflictException(
            'Reserved stock is missing for this order',
          );
        }

        for (let i = 0; i < item.quantity; i++) {
          const ticketNumber = `TKT-${randomBytes(5).toString('hex').toUpperCase()}`;
          const rows = await m.query(
            `INSERT INTO tickets
               (ticket_number, order_item_id, event_id, ticket_type_id, owner_id, qr_token)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING ticket_id, ticket_number`,
            [
              ticketNumber,
              item.order_item_id,
              item.event_id,
              item.ticket_type_id,
              order.buyer_id,
              randomUUID(),
            ],
          );
          issued.push(rows[0]);
        }
      }

      await m.query(
        `UPDATE orders
         SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1`,
        [orderId],
      );

      return {
        message: 'Order paid and tickets issued.',
        orderId,
        status: 'PAID',
        tickets: issued.map((t) => ({
          ticketId: t.ticket_id,
          ticketNumber: t.ticket_number,
        })),
      };
    });
  }
}
