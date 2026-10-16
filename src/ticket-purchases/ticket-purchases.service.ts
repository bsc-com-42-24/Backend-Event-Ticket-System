import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';

@Injectable()
export class TicketPurchasesService {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async purchaseTickets(dto: CreatePurchaseDto) {
    const { ticketTypeId, quantity } = dto;
    const client = await this.databaseService.getClient();

    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const ticketResult = await client.query(
        `SELECT id, price, quantity_available
         FROM ticket_types
         WHERE id = $1
         FOR UPDATE`,
        [ticketTypeId],
      );

      if (ticketResult.rows.length === 0) {
        throw new NotFoundException('Ticket type not found.');
      }

      const ticket = ticketResult.rows[0];
      const available = Number(ticket.quantity_available);
      const price = Number(ticket.price);

      if (!Number.isInteger(available) || available < quantity) {
        throw new BadRequestException(
          `Only ${available} tickets are available.`,
        );
      }

      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('The ticket price is invalid.');
      }

      const totalAmount = price * quantity;

      await client.query(
        `UPDATE ticket_types
         SET quantity_available = quantity_available - $1
         WHERE id = $2`,
        [quantity, ticketTypeId],
      );

      const orderResult = await client.query(
        `INSERT INTO orders (user_id, total_amount, status)
         VALUES (NULL, $1, $2)
         RETURNING id, total_amount, status`,
        [totalAmount, 'PENDING'],
      );

      const order = orderResult.rows[0];

      await client.query(
        `INSERT INTO order_items
           (order_id, ticket_type_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [order.id, ticketTypeId, quantity, price],
      );

      await client.query('COMMIT');
      transactionStarted = false;

      return {
        message: 'Ticket order created successfully.',
        orderId: order.id,
        ticketTypeId,
        quantity,
        unitPrice: price,
        totalAmount,
        status: order.status,
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original error if rollback also fails.
        }
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to process the ticket purchase. Check the database connection and schema.',
      );
    } finally {
      client.release();
    }
  }
}