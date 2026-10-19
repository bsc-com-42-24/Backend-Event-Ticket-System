import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import { Ticket } from './entities/ticket.entity';
import { QrCodeService } from './qr-code/qr-code.service';

@Injectable()
export class TicketsService {
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
          throw new ConflictException('Reserved stock is missing for this order');
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