import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly reservationMinutes = 15;

  constructor(private readonly database: DatabaseService) {}

  private async expirePendingOrders(client: any): Promise<void> {
    await client.query(`
      WITH expired_orders AS MATERIALIZED (
        SELECT order_id
        FROM orders
        WHERE status = 'PENDING'
          AND expires_at <= NOW()
        FOR UPDATE SKIP LOCKED
      ),
      reserved_quantities AS (
        SELECT
          oi.ticket_type_id,
          SUM(oi.quantity)::integer AS quantity
        FROM order_items oi
        INNER JOIN expired_orders eo
          ON eo.order_id = oi.order_id
        GROUP BY oi.ticket_type_id
      ),
      released AS (
        UPDATE ticket_types tt
        SET quantity_reserved =
          GREATEST(0, tt.quantity_reserved - rq.quantity)
        FROM reserved_quantities rq
        WHERE tt.ticket_type_id = rq.ticket_type_id
        RETURNING tt.ticket_type_id
      )
      UPDATE orders o
      SET status = 'EXPIRED',
          updated_at = NOW()
      FROM expired_orders eo
      WHERE o.order_id = eo.order_id
    `);
  }

  async createOrder(
    user: AuthenticatedUser,
    dto: CreateOrderDto,
  ) {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');

      await this.expirePendingOrders(client);

      const eventResult = await client.query(
        `
        SELECT event_id, status
        FROM events
        WHERE event_id = $1
        FOR UPDATE
        `,
        [dto.eventId],
      );

      if (eventResult.rows.length === 0) {
        throw new NotFoundException('Event not found');
      }

      if (eventResult.rows[0].status !== 'PUBLISHED') {
        throw new BadRequestException(
          'Tickets are not available for this event',
        );
      }

      const uniqueTypeIds = new Set(
        dto.items.map((item) => item.ticketTypeId),
      );

      if (uniqueTypeIds.size !== dto.items.length) {
        throw new BadRequestException(
          'Each ticket type can only appear once in an order',
        );
      }

      let totalCents = 0;

      const preparedItems: {
        ticketTypeId: string;
        quantity: number;
        unitPrice: string;
        subtotal: string;
      }[] = [];

      for (const item of dto.items) {
        const typeResult = await client.query(
          `
          SELECT
            ticket_type_id,
            event_id,
            price,
            currency,
            quantity_total,
            quantity_sold,
            quantity_reserved,
            per_order_limit,
            sales_start_at,
            sales_end_at,
            is_active
          FROM ticket_types
          WHERE ticket_type_id = $1
          FOR UPDATE
          `,
          [item.ticketTypeId],
        );

        if (typeResult.rows.length === 0) {
          throw new NotFoundException(
            `Ticket type ${item.ticketTypeId} was not found`,
          );
        }

        const type = typeResult.rows[0];

        if (String(type.event_id) !== String(dto.eventId)) {
          throw new BadRequestException(
            'All ticket types must belong to the selected event',
          );
        }

        if (!type.is_active) {
          throw new BadRequestException(
            'One of the selected ticket types is inactive',
          );
        }

        if (item.quantity > Number(type.per_order_limit)) {
          throw new BadRequestException(
            `You can only purchase ${type.per_order_limit} tickets of this type per order`,
          );
        }

        const now = new Date();

        if (
          type.sales_start_at &&
          now < new Date(type.sales_start_at)
        ) {
          throw new BadRequestException(
            'Ticket sales have not started',
          );
        }

        if (
          type.sales_end_at &&
          now > new Date(type.sales_end_at)
        ) {
          throw new BadRequestException(
            'Ticket sales have ended',
          );
        }

        if (type.currency.trim() !== 'MWK') {
          throw new BadRequestException(
            'Only MWK ticket prices are currently supported',
          );
        }

        const available =
          Number(type.quantity_total) -
          Number(type.quantity_sold) -
          Number(type.quantity_reserved);

        if (available < item.quantity) {
          throw new BadRequestException(
            'Not enough tickets are available',
          );
        }

        // Check that enough pre-generated tickets exist
        // after accounting for existing reservations.
        const inventoryResult = await client.query(
          `
          SELECT COUNT(*)::integer AS available
          FROM tickets
          WHERE ticket_type_id = $1
            AND customer_id IS NULL
            AND status = 'ISSUED'
          `,
          [item.ticketTypeId],
        );

        const unassignedTickets =
          Number(inventoryResult.rows[0].available);

        if (
          unassignedTickets -
            Number(type.quantity_reserved) <
          item.quantity
        ) {
          throw new BadRequestException(
            'Ticket inventory has not been generated for this quantity',
          );
        }

        const price = Number(type.price);

        if (!Number.isFinite(price) || price < 0) {
          throw new BadRequestException(
            'Invalid ticket price',
          );
        }

        const unitCents = Math.round(price * 100);
        const subtotalCents = unitCents * item.quantity;

        totalCents += subtotalCents;

        preparedItems.push({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPrice: (unitCents / 100).toFixed(2),
          subtotal: (subtotalCents / 100).toFixed(2),
        });

        await client.query(
          `
          UPDATE ticket_types
          SET quantity_reserved = quantity_reserved + $1
          WHERE ticket_type_id = $2
          `,
          [item.quantity, item.ticketTypeId],
        );
      }

      const totalAmount = (totalCents / 100).toFixed(2);
      const orderNumber = `ORD-${randomUUID()}`;

      const orderResult = await client.query(
        `
        INSERT INTO orders (
          order_number,
          customer_id,
          event_id,
          total_amount,
          currency,
          status,
          expires_at
        )
        VALUES (
          $1, $2, $3, $4, 'MWK', 'PENDING',
          NOW() + INTERVAL '${this.reservationMinutes} minutes'
        )
        RETURNING *
        `,
        [
          orderNumber,
          user.userId,
          dto.eventId,
          totalAmount,
        ],
      );

      const order = orderResult.rows[0];

      for (const item of preparedItems) {
        await client.query(
          `
          INSERT INTO order_items (
            order_id,
            ticket_type_id,
            quantity,
            unit_price,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            order.order_id,
            item.ticketTypeId,
            item.quantity,
            item.unitPrice,
            item.subtotal,
          ],
        );
      }

      await client.query('COMMIT');

      return {
        message: 'Order created successfully',
        order,
        items: preparedItems,
        reservationMinutes: this.reservationMinutes,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getMyOrders(user: AuthenticatedUser) {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');
      await this.expirePendingOrders(client);

      const result = await client.query(
        `
        SELECT *
        FROM orders
        WHERE customer_id = $1
        ORDER BY created_at DESC
        `,
        [user.userId],
      );

      await client.query('COMMIT');

      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrder(
    orderNumber: string,
    user: AuthenticatedUser,
  ) {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');
      await this.expirePendingOrders(client);

      const result = await client.query(
        `
        SELECT *
        FROM orders
        WHERE order_number = $1
        `,
        [orderNumber],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Order not found');
      }

      const order = result.rows[0];

      if (
        String(order.customer_id) !== String(user.userId) &&
        user.role !== UserRole.ADMIN
      ) {
        throw new ForbiddenException(
          'You cannot access this order',
        );
      }

      const items = await client.query(
        `
        SELECT
          oi.*,
          tt.type_name
        FROM order_items oi
        INNER JOIN ticket_types tt
          ON tt.ticket_type_id = oi.ticket_type_id
        WHERE oi.order_id = $1
        `,
        [order.order_id],
      );

      await client.query('COMMIT');

      return {
        order,
        items: items.rows,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmPaidOrder(orderId: string) {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `
        SELECT *
        FROM orders
        WHERE order_id = $1
        FOR UPDATE
        `,
        [orderId],
      );

      if (orderResult.rows.length === 0) {
        throw new NotFoundException('Order not found');
      }

      const order = orderResult.rows[0];

      if (order.status === 'PAID') {
        await client.query('COMMIT');
        return { alreadyPaid: true };
      }

      if (order.status !== 'PENDING') {
        await client.query('COMMIT');
        return {
          fulfilled: false,
          reason: 'Order is no longer pending',
        };
      }

      if (new Date(order.expires_at) <= new Date()) {
        await this.expirePendingOrders(client);
        await client.query('COMMIT');

        return {
          fulfilled: false,
          reason: 'Order reservation has expired',
        };
      }

      const itemsResult = await client.query(
        `
        SELECT *
        FROM order_items
        WHERE order_id = $1
        ORDER BY order_item_id
        FOR UPDATE
        `,
        [orderId],
      );

      for (const item of itemsResult.rows) {
        const typeResult = await client.query(
          `
          SELECT *
          FROM ticket_types
          WHERE ticket_type_id = $1
          FOR UPDATE
          `,
          [item.ticket_type_id],
        );

        if (typeResult.rows.length === 0) {
          throw new NotFoundException(
            'Ticket type no longer exists',
          );
        }

        const ticketResult = await client.query(
          `
          SELECT ticket_id
          FROM tickets
          WHERE ticket_type_id = $1
            AND customer_id IS NULL
            AND status = 'ISSUED'
          ORDER BY ticket_id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
          `,
          [item.ticket_type_id, item.quantity],
        );

        if (ticketResult.rows.length !== Number(item.quantity)) {
          throw new BadRequestException(
            'Not enough generated tickets to fulfil this order',
          );
        }

        const ticketIds = ticketResult.rows.map(
          (ticket: { ticket_id: string }) => ticket.ticket_id,
        );

        await client.query(
          `
          UPDATE tickets
          SET customer_id = $1,
              order_item_id = $2,
              purchased_at = NOW()
          WHERE ticket_id = ANY($3::bigint[])
          `,
          [
            order.customer_id,
            item.order_item_id,
            ticketIds,
          ],
        );

        await client.query(
          `
          UPDATE ticket_types
          SET quantity_reserved =
                GREATEST(0, quantity_reserved - $1),
              quantity_sold = quantity_sold + $1
          WHERE ticket_type_id = $2
          `,
          [item.quantity, item.ticket_type_id],
        );
      }

      await client.query(
        `
        UPDATE orders
        SET status = 'PAID',
            updated_at = NOW()
        WHERE order_id = $1
        `,
        [orderId],
      );

      await client.query('COMMIT');

      return {
        fulfilled: true,
        message: 'Order paid and tickets assigned successfully',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
