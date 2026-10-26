import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import type { PoolClient } from 'pg';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';

@Injectable()
export class TicketTypesService {
  private readonly logger = new Logger(TicketTypesService.name);

  constructor(private readonly database: DatabaseService) {}

  async findPublic(eventId: string) {
    const event = await this.database.query(
      `SELECT event_id FROM events
       WHERE event_id = $1 AND status = 'PUBLISHED'`,
      [eventId],
    );
    if (!event.rows.length) throw new NotFoundException('Published event not found');

    const result = await this.database.query(
      `SELECT ticket_type_id, event_id, type_name, description, price, currency,
              quantity_total, quantity_sold, quantity_reserved,
              (quantity_total - quantity_sold - quantity_reserved) AS remaining,
              per_order_limit, sales_start_at, sales_end_at, is_active
       FROM ticket_types
       WHERE event_id = $1 AND is_active = TRUE
       ORDER BY ticket_type_id`,
      [eventId],
    );
    return result.rows.map((row) => this.toTicketType(row));
  }

  async create(eventId: string, dto: CreateTicketTypeDto, user: AuthenticatedUser) {
    this.validateSalesPeriod(dto.salesStartAt, dto.salesEndAt);
    const client = await this.database.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.lockManagedEvent(client, eventId, user);
      const allocated = await client.query(
        `SELECT COALESCE(SUM(quantity_total), 0) AS allocated
         FROM ticket_types WHERE event_id = $1`,
        [eventId],
      );
      if (Number(allocated.rows[0].allocated) + dto.quantity > Number(event.capacity)) {
        throw new ConflictException(
          `Ticket type quantities cannot exceed event capacity (${event.capacity})`,
        );
      }

      const inserted = await client.query(
        `INSERT INTO ticket_types
           (event_id, type_name, description, price, currency, quantity_total,
            per_order_limit, sales_start_at, sales_end_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ticket_type_id, event_id, type_name, description, price, currency,
                   quantity_total, quantity_sold, quantity_reserved,
                   (quantity_total - quantity_sold - quantity_reserved) AS remaining,
                   per_order_limit, sales_start_at, sales_end_at, is_active`,
        [
          eventId,
          dto.name,
          dto.description ?? null,
          dto.price,
          dto.currency.toUpperCase(),
          dto.quantity,
          dto.perOrderLimit ?? 10,
          dto.salesStartAt ?? null,
          dto.salesEndAt ?? null,
        ],
      );
      await client.query('COMMIT');
      return this.toTicketType(inserted.rows[0]);
    } catch (error) {
      await this.rollback(client);
      this.throwIfDuplicateTypeName(error);
      throw error;
    } finally {
      client.release();
    }
  }

  async update(
    eventId: string,
    ticketTypeId: string,
    dto: UpdateTicketTypeDto,
    user: AuthenticatedUser,
  ) {
    this.validateSalesPeriod(dto.salesStartAt, dto.salesEndAt);
    const client = await this.database.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.lockManagedEvent(client, eventId, user);
      const existing = await this.lockTicketType(client, eventId, ticketTypeId);
      this.validateSalesPeriod(
        dto.salesStartAt !== undefined ? dto.salesStartAt : existing.sales_start_at,
        dto.salesEndAt !== undefined ? dto.salesEndAt : existing.sales_end_at,
      );
      const quantity = dto.quantity ?? Number(existing.quantity_total);
      const alreadyCommitted =
        Number(existing.quantity_sold) + Number(existing.quantity_reserved);
      if (quantity < alreadyCommitted) {
        throw new ConflictException(
          `Quantity cannot be lower than sold and reserved tickets (${alreadyCommitted})`,
        );
      }

      const allocated = await client.query(
        `SELECT COALESCE(SUM(quantity_total), 0) AS allocated
         FROM ticket_types
         WHERE event_id = $1 AND ticket_type_id <> $2`,
        [eventId, ticketTypeId],
      );
      if (Number(allocated.rows[0].allocated) + quantity > Number(event.capacity)) {
        throw new ConflictException(
          `Ticket type quantities cannot exceed event capacity (${event.capacity})`,
        );
      }

      const updated = await client.query(
        `UPDATE ticket_types
         SET type_name = COALESCE($1, type_name),
             description = CASE WHEN $2 THEN $3 ELSE description END,
             price = COALESCE($4, price),
             currency = COALESCE($5, currency),
             quantity_total = $6,
             per_order_limit = COALESCE($7, per_order_limit),
             sales_start_at = CASE WHEN $8 THEN $9 ELSE sales_start_at END,
             sales_end_at = CASE WHEN $10 THEN $11 ELSE sales_end_at END
         WHERE ticket_type_id = $12 AND event_id = $13
         RETURNING ticket_type_id, event_id, type_name, description, price, currency,
                   quantity_total, quantity_sold, quantity_reserved,
                   (quantity_total - quantity_sold - quantity_reserved) AS remaining,
                   per_order_limit, sales_start_at, sales_end_at, is_active`,
        [
          dto.name ?? null,
          dto.description !== undefined,
          dto.description ?? null,
          dto.price ?? null,
          dto.currency?.toUpperCase() ?? null,
          quantity,
          dto.perOrderLimit ?? null,
          dto.salesStartAt !== undefined,
          dto.salesStartAt ?? null,
          dto.salesEndAt !== undefined,
          dto.salesEndAt ?? null,
          ticketTypeId,
          eventId,
        ],
      );
      await client.query('COMMIT');
      return this.toTicketType(updated.rows[0]);
    } catch (error) {
      await this.rollback(client);
      this.throwIfDuplicateTypeName(error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deactivate(eventId: string, ticketTypeId: string, user: AuthenticatedUser) {
    const client = await this.database.getClient();
    try {
      await client.query('BEGIN');
      await this.lockManagedEvent(client, eventId, user);
      const type = await this.lockTicketType(client, eventId, ticketTypeId);
      const result = await client.query(
        `UPDATE ticket_types SET is_active = FALSE
         WHERE ticket_type_id = $1 AND event_id = $2
         RETURNING ticket_type_id, event_id, type_name, description, price, currency,
                   quantity_total, quantity_sold, quantity_reserved,
                   (quantity_total - quantity_sold - quantity_reserved) AS remaining,
                   per_order_limit, sales_start_at, sales_end_at, is_active`,
        [type.ticket_type_id, eventId],
      );
      await client.query('COMMIT');
      return this.toTicketType(result.rows[0]);
    } catch (error) {
      await this.rollback(client);
      this.throwIfDuplicateTypeName(error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getSalesSummary(eventId: string, user: AuthenticatedUser) {
    const event = await this.getManagedEvent(eventId, user);
    const result = await this.database.query(
      `SELECT tt.ticket_type_id, tt.type_name, tt.currency,
              tt.quantity_sold AS sold, tt.quantity_reserved AS reserved,
              (tt.quantity_total - tt.quantity_sold - tt.quantity_reserved) AS remaining,
              COALESCE(SUM(oi.quantity * oi.unit_price)
                FILTER (WHERE o.status = 'PAID'), 0) AS revenue
       FROM ticket_types tt
       LEFT JOIN order_items oi ON oi.ticket_type_id = tt.ticket_type_id
       LEFT JOIN orders o ON o.order_id = oi.order_id
       WHERE tt.event_id = $1
       GROUP BY tt.ticket_type_id
       ORDER BY tt.ticket_type_id`,
      [eventId],
    );
    const ticketTypes = result.rows.map((row) => ({
      ticketTypeId: String(row.ticket_type_id),
      name: row.type_name,
      currency: row.currency.trim(),
      sold: Number(row.sold),
      reserved: Number(row.reserved),
      remaining: Number(row.remaining),
      revenue: Number(row.revenue),
    }));
    const revenueByCurrency = ticketTypes.reduce<Record<string, number>>((totals, type) => {
      totals[type.currency] = (totals[type.currency] ?? 0) + type.revenue;
      return totals;
    }, {});
    return {
      eventId: String(event.event_id),
      totals: {
        sold: ticketTypes.reduce((total, type) => total + type.sold, 0),
        reserved: ticketTypes.reduce((total, type) => total + type.reserved, 0),
        remaining: ticketTypes.reduce((total, type) => total + type.remaining, 0),
        revenueByCurrency,
      },
      ticketTypes,
    };
  }

  async getAttendanceSummary(eventId: string, user: AuthenticatedUser) {
    await this.getManagedEvent(eventId, user);
    const result = await this.database.query(
      `SELECT COUNT(*)::int AS issued,
              COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL OR status = 'USED')::int AS checked_in
      FROM tickets
      WHERE event_id = $1 AND status IN ('ISSUED', 'USED')`,
      [eventId],
    );
    const issued = Number(result.rows[0].issued);
    const checkedIn = Number(result.rows[0].checked_in);
    return {
      eventId,
      issued,
      checkedIn,
      notCheckedIn: issued - checkedIn,
    };
  }

  private async lockManagedEvent(client: PoolClient, eventId: string, user: AuthenticatedUser) {
    const result = await client.query(
      `SELECT event_id, organizer_id, capacity
       FROM events WHERE event_id = $1 FOR UPDATE`,
      [eventId],
    );
    if (!result.rows.length) throw new NotFoundException('Event not found');
    this.assertOwnerOrAdmin(result.rows[0], user);
    return result.rows[0];
  }

  private async getManagedEvent(eventId: string, user: AuthenticatedUser) {
    const result = await this.database.query(
      `SELECT event_id, organizer_id, capacity FROM events WHERE event_id = $1`,
      [eventId],
    );
    if (!result.rows.length) throw new NotFoundException('Event not found');
    this.assertOwnerOrAdmin(result.rows[0], user);
    return result.rows[0];
  }

  private async lockTicketType(client: PoolClient, eventId: string, ticketTypeId: string) {
    const result = await client.query(
      `SELECT ticket_type_id, quantity_total, quantity_sold, quantity_reserved
       FROM ticket_types
       WHERE ticket_type_id = $1 AND event_id = $2 FOR UPDATE`,
      [ticketTypeId, eventId],
    );
    if (!result.rows.length) throw new NotFoundException('Ticket type not found');
    return result.rows[0];
  }

  private assertOwnerOrAdmin(event: { organizer_id: string | number }, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.ADMIN &&
      (user.role !== UserRole.EVENT_MANAGER || String(event.organizer_id) !== String(user.userId))
    ) {
      throw new ForbiddenException('Only the event owner or an administrator may manage this event');
    }
  }

  private validateSalesPeriod(
    start?: Date | string | null,
    end?: Date | string | null,
  ) {
    if (start && end && new Date(end) <= new Date(start)) {
      throw new BadRequestException('salesEndAt must be after salesStartAt');
    }
  }

  private throwIfDuplicateTypeName(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ConflictException('A ticket type with this name already exists for the event');
    }
  }

  private toTicketType(row: {
    ticket_type_id: string | number;
    event_id: string | number;
    type_name: string;
    description: string | null;
    price: string | number;
    currency: string;
    quantity_total: string | number;
    quantity_sold: string | number;
    quantity_reserved: string | number;
    remaining: string | number;
    per_order_limit: string | number;
    sales_start_at: Date | null;
    sales_end_at: Date | null;
    is_active: boolean;
  }) {
    return {
      ticketTypeId: String(row.ticket_type_id),
      eventId: String(row.event_id),
      name: row.type_name,
      description: row.description,
      price: Number(row.price),
      currency: String(row.currency).trim(),
      quantity: Number(row.quantity_total),
      sold: Number(row.quantity_sold),
      reserved: Number(row.quantity_reserved),
      remaining: Number(row.remaining),
      perOrderLimit: Number(row.per_order_limit),
      salesStartAt: row.sales_start_at,
      salesEndAt: row.sales_end_at,
      isActive: row.is_active,
    };
  }

  private async rollback(client: PoolClient) {
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      this.logger.error(
        'Failed to roll back ticket type transaction',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
