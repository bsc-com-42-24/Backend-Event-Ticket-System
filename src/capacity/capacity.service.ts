import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';

const LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class CapacityService {
  constructor(
    @InjectRepository(Event) private readonly repo: Repository<Event>,
    private readonly dataSource: DataSource,
  ) {}

  async getAvailability(eventId: string) {
    const event = await this.repo.findOne({ where: { id: eventId } });
    if (!event || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException('Event not found');
    }

    const rows = await this.dataSource.query(
      `SELECT ticket_type_id, type_name, price, currency, quantity_total,
              quantity_sold, quantity_reserved,
              GREATEST(quantity_total - quantity_sold - quantity_reserved, 0) AS configured_remaining,
              (SELECT COUNT(*)::int
               FROM tickets t
               WHERE t.event_id = tt.event_id
                 AND t.ticket_type_id = tt.ticket_type_id
                 AND t.customer_id IS NULL
                 AND t.status = 'ISSUED') AS generated_remaining,
              sales_start_at, sales_end_at
       FROM ticket_types tt
       WHERE tt.event_id = $1 AND tt.is_active = TRUE
       ORDER BY ticket_type_id`,
      [eventId],
    );

    const now = new Date();
    const eventSalesOpen =
      event.startAt > now && event.endAt > now;
    const ticketTypes = rows.map((row) => {
      const configuredRemaining = Number(row.configured_remaining);
      const generatedRemaining = Number(row.generated_remaining);
      const remaining = Math.min(configuredRemaining, generatedRemaining);
      const needsGeneration = generatedRemaining < configuredRemaining;
      const salesStarted =
        !row.sales_start_at || new Date(row.sales_start_at) <= now;
      const salesNotEnded =
        !row.sales_end_at || new Date(row.sales_end_at) >= now;
      const salesOpen =
        eventSalesOpen &&
        remaining > 0 &&
        salesStarted &&
        salesNotEnded;

      return {
        ticketTypeId: String(row.ticket_type_id),
        name: row.type_name,
        price: Number(row.price),
        currency: String(row.currency).trim(),
        quantity: Number(row.quantity_total),
        sold: Number(row.quantity_sold),
        reserved: Number(row.quantity_reserved),
        configuredRemaining,
        generatedRemaining,
        remaining,
        needsGeneration,
        lowStock: remaining > 0 && remaining <= LOW_STOCK_THRESHOLD,
        salesOpen,
      };
    });
    const remaining = ticketTypes.reduce(
      (total, ticketType) => total + ticketType.remaining,
      0,
    );

    return {
      eventId: event.id,
      status: event.status,
      capacity: event.capacity,
      ticketsIssued: event.ticketsIssued,
      remainingTickets: remaining,
      unallocatedCapacity: Math.max(
        event.capacity - event.ticketsIssued,
        0,
      ),
      soldOut:
        ticketTypes.length === 0 ||
        ticketTypes.every((ticketType) => ticketType.configuredRemaining === 0),
      needsGeneration: ticketTypes.some((ticketType) => ticketType.needsGeneration),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      salesOpen: ticketTypes.some((ticketType) => ticketType.salesOpen),
      ticketTypes,
    };
  }
}
