import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';

import { DatabaseService } from '../database/database.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class TicketPurchasesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async purchaseTickets(buyerId: string | number, dto: CreatePurchaseDto) {
    const { ticketTypeId, quantity } = dto;
    const client = await this.databaseService.getClient();

    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const ticketResult = await client.query(
        `SELECT ticket_type_id, event_id, price, currency, per_order_limit, is_active,
                sales_start_at, sales_end_at,
                (quantity_total - quantity_sold - quantity_reserved) AS available
         FROM ticket_types
         WHERE ticket_type_id = $1
         FOR UPDATE`,
        [ticketTypeId],
      );

      if (ticketResult.rows.length === 0) {
        throw new NotFoundException('Ticket type not found.');
      }

      const ticket = ticketResult.rows[0];
      const available = Number(ticket.available);
      const price = Number(ticket.price);
      const now = new Date();

      if (!ticket.is_active) {
        throw new BadRequestException('This ticket type is not on sale.');
      }
      if (ticket.sales_start_at && now < new Date(ticket.sales_start_at)) {
        throw new BadRequestException('Ticket sales have not started yet.');
      }
      if (ticket.sales_end_at && now > new Date(ticket.sales_end_at)) {
        throw new BadRequestException('Ticket sales have ended.');
      }
      if (quantity > ticket.per_order_limit) {
        throw new BadRequestException(
          `You can buy at most ${ticket.per_order_limit} tickets per order.`,
        );
      }
      if (available < quantity) {
        throw new BadRequestException(`Only ${available} tickets are available.`);
      }

      const eventUpdate = await client.query(
        `UPDATE events
         SET tickets_issued = tickets_issued + $1
         WHERE event_id = $2
           AND status = 'PUBLISHED'
           AND end_at > NOW()
           AND tickets_issued + $1 <= capacity
         RETURNING event_id`,
        [quantity, ticket.event_id],
      );
      if (eventUpdate.rowCount === 0) {
        throw new BadRequestException(
          'The event is not on sale, has ended, or is sold out.',
        );
      }

      const subtotal = Math.round(price * quantity * 100) / 100;
      const orderNumber = `ORD-${Date.now()}-${randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;

      await client.query(
        `UPDATE ticket_types
         SET quantity_reserved = quantity_reserved + $1
         WHERE ticket_type_id = $2`,
        [quantity, ticketTypeId],
      );

      const orderResult = await client.query(
        `INSERT INTO orders
           (order_number, buyer_id, status, subtotal, fees, total_amount,
            currency, expires_at)
         VALUES ($1, $2, 'PENDING', $3, 0, $3, $4,
                 CURRENT_TIMESTAMP + INTERVAL '15 minutes')
         RETURNING order_id, order_number, status, total_amount, currency, expires_at`,
        [orderNumber, buyerId, subtotal, ticket.currency],
      );
      const order = orderResult.rows[0];

      await client.query(
        `INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [order.order_id, ticketTypeId, quantity, price],
      );

      await client.query('COMMIT');
      transactionStarted = false;

      return {
        message: 'Ticket order created successfully.',
        orderId: order.order_id,
        orderNumber: order.order_number,
        ticketTypeId,
        quantity,
        unitPrice: price,
        totalAmount: Number(order.total_amount),
        currency: order.currency,
        status: order.status,
        expiresAt: order.expires_at,
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // keep the original error
        }
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('Ticket purchase failed:', error);
      throw new InternalServerErrorException(
        'Unable to process the ticket purchase.',
      );
    } finally {
      client.release();
    }
  }
}