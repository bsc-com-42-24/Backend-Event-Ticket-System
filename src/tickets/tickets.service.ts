import {
  ConflictException,
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
  event_id: string;
  ticket_status: string;
  event_status: string;
}

interface UpdatedTicket {
  ticket_id: string;
  event_id: string;
  checked_in_at: Date;
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

  async validateTicket(
    qrToken: string,
    validatorId: string,
    attemptedEventId?: string,
  ): Promise<TicketValidationResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const tickets: TicketForValidation[] = await manager.query(
        `SELECT t.ticket_id, t.event_id, t.status AS ticket_status, e.status AS event_status
         FROM tickets t
         JOIN events e ON e.event_id = t.event_id
         WHERE t.qr_token = $1
         FOR UPDATE OF t, e`,
        [qrToken],
      );

      const ticket = tickets[0];
      if (!ticket) {
        return this.rejected(TicketValidationReason.NOT_FOUND);
      }
      if (ticket.ticket_status === 'USED') {
        return this.rejected(
          TicketValidationReason.ALREADY_USED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }
      if (
        ticket.ticket_status === 'CANCELLED' ||
        ticket.ticket_status === 'REFUNDED'
      ) {
        return this.rejected(
          TicketValidationReason.CANCELLED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }
      if (ticket.event_status === 'CANCELLED') {
        return this.rejected(
          TicketValidationReason.EVENT_CANCELLED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }
      if (attemptedEventId && attemptedEventId !== ticket.event_id) {
        return this.rejected(
          TicketValidationReason.WRONG_EVENT,
          ticket.ticket_id,
          ticket.event_id,
        );
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
        return this.rejected(
          TicketValidationReason.ALREADY_USED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }

      return {
        accepted: true as const,
        reason: null,
        ticketId: updated.ticket_id,
        eventId: updated.event_id,
        validatedAt: updated.checked_in_at,
      };
    });

    await this.recordValidation(result, validatorId, attemptedEventId);
    return result;
  }

  private rejected(
    reason: TicketValidationReason,
    ticketId: string | null = null,
    eventId: string | null = null,
  ): TicketValidationResult {
    return {
      accepted: false,
      reason,
      ticketId,
      eventId,
      validatedAt: null,
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
