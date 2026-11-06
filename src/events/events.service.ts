
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { UserRole } from '../users/user-role.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto, QueryMyEventsDto } from './dto/query-events.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event } from './entities/event.entity';
import { EventStatus } from './enums/event-status.enum';
import type { AuthUser } from './types/auth-user.type';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly repo: Repository<Event>,
    private readonly dataSource: DataSource,
  ) {}

  // FR-EVENT-01, 02, 10 — create event and its ticket types together
  async create(dto: CreateEventDto, user: AuthUser) {
    this.validateDates(dto.startAt, dto.endAt);

    if (dto.startAt <= new Date()) {
      throw new BadRequestException('startAt must be in the future');
    }

    // Separate ticket types from event properties.
    const { ticketTypes, ...eventData } = dto;

    // Check that ticket quantities do not exceed event capacity.
    const totalQuantity = ticketTypes.reduce(
      (total, type) => total + type.quantity,
      0,
    );

    if (totalQuantity > eventData.capacity) {
      throw new BadRequestException(
        `Ticket type quantities (${totalQuantity}) cannot exceed event capacity (${eventData.capacity})`,
      );
    }

    // Validate ticket sales periods.
    for (const type of ticketTypes) {
      if (
        type.salesStartAt &&
        type.salesEndAt &&
        type.salesEndAt <= type.salesStartAt
      ) {
        throw new BadRequestException(
          `Sales end date must be after sales start date for ${type.name}`,
        );
      }
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // 1. Create the event.
        const event = manager.create(Event, {
          ...eventData,
          ticketsIssued: 0,
          status: EventStatus.DRAFT,
          organizerId: user.userId,
        });

        const savedEvent = await manager.save(Event, event);

        // 2. Create ticket types for the event.
        const savedTicketTypes: {
          ticketTypeId: string;
          eventId: string;
          name: string;
          description: string | null;
          price: number;
          currency: string;
          quantity: number;
          sold: number;
          reserved: number;
          remaining: number;
          perOrderLimit: number;
          salesStartAt: Date | null;
          salesEndAt: Date | null;
          isActive: boolean;
        }[] = [];

        for (const type of ticketTypes) {
          const result = await manager.query(
            `INSERT INTO ticket_types
               (event_id, type_name, description, price, currency,
                quantity_total, per_order_limit, sales_start_at, sales_end_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ticket_type_id, event_id, type_name, description,
                       price, currency, quantity_total, quantity_sold,
                       quantity_reserved,
                       (quantity_total - quantity_sold - quantity_reserved) AS remaining,
                       per_order_limit, sales_start_at, sales_end_at, is_active`,
            [
              savedEvent.id,
              type.name,
              type.description ?? null,
              type.price,
              type.currency.toUpperCase(),
              type.quantity,
              type.perOrderLimit ?? 10,
              type.salesStartAt ?? null,
              type.salesEndAt ?? null,
            ],
          );

          const row = result[0];

          savedTicketTypes.push({
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
          });
        }

        // 3. Return the event and its ticket types.
        return {
          ...this.toResponse(savedEvent),
          ticketTypes: savedTicketTypes,
        };
      });
    } catch (error) {
      // Handle duplicate ticket type names.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'A ticket type with this name already exists for the event',
        );
      }

      throw error;
    }
  }

  // FR-EVENT-04 — customer discovery: only PUBLISHED events that have not ended
  async findPublished(q: QueryEventsDto) {
    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: EventStatus.PUBLISHED })
      .andWhere('e.endAt > NOW()');

    return this.paginate(qb, q);
  }

  // FR-EVENT-03 — events managed by the current user (all statuses)
  async findMine(q: QueryMyEventsDto, user: AuthUser) {
    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.organizerId = :uid', { uid: user.userId });

    if (q.status) {
      qb.andWhere('e.status = :st', { st: q.status });
    }

    return this.paginate(qb, q);
  }

  // FR-EVENT-05 — details incl. remaining availability. DRAFTs are visible to owner/admin only.
  async findOne(id: string, user?: AuthUser | null) {
    const event = await this.repo.findOne({ where: { id } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (
      event.status === EventStatus.DRAFT &&
      !(user && this.canManage(event, user))
    ) {
      throw new NotFoundException('Event not found');
    }

    return this.toResponse(event);
  }

  // FR-EVENT-06 — row is locked so capacity changes can't race with ticket purchases
  async update(id: string, dto: UpdateEventDto, user: AuthUser) {
  return this.dataSource.transaction(async (m) => {
    const event = await this.lockAndGet(m, id);
    this.assertCanManage(event, user);

    if (event.status === EventStatus.CANCELLED) {
      throw new ConflictException('Cancelled events cannot be updated');
    }

    const { status, ...eventChanges } = dto;

    const changes = Object.fromEntries(
      Object.entries(eventChanges).filter(([, v]) => v !== undefined),
    );

    // Handle event status changes.
    if (status !== undefined) {
      if (status === EventStatus.PUBLISHED) {
        if (event.status !== EventStatus.DRAFT) {
          throw new ConflictException(
            'Only DRAFT events can be published',
          );
        }

        if (event.endAt <= new Date()) {
          throw new BadRequestException(
            'Cannot publish an event that has already ended',
          );
        }

        event.status = EventStatus.PUBLISHED;
        event.publishedAt = new Date();
      } else if (status === EventStatus.CANCELLED) {
        event.status = EventStatus.CANCELLED;
        event.cancelledAt = new Date();
      } else {
        throw new BadRequestException(
          'Events cannot be moved back to DRAFT',
        );
      }
    }

    // Validate event details only when details are being updated.
    if (Object.keys(changes).length > 0) {
      const startAt = dto.startAt ?? event.startAt;
      const endAt = dto.endAt ?? event.endAt;

      this.validateDates(startAt, endAt);

      if (dto.startAt && dto.startAt <= new Date()) {
        throw new BadRequestException('startAt must be in the future');
      }

      if (dto.endAt && endAt <= new Date()) {
        throw new BadRequestException('endAt must be in the future');
      }

      if (
        dto.capacity !== undefined &&
        dto.capacity < event.ticketsIssued
      ) {
        throw new ConflictException(
          `Capacity cannot be lower than tickets already issued (${event.ticketsIssued})`,
        );
      }

      if (dto.capacity !== undefined) {
        const [allocation] = await m.query(
          `SELECT COALESCE(SUM(quantity_total), 0) AS allocated
           FROM ticket_types WHERE event_id = $1`,
          [id],
        );

        if (dto.capacity < Number(allocation.allocated)) {
          throw new ConflictException(
            `Capacity cannot be lower than configured ticket type quantities (${allocation.allocated})`,
          );
        }
      }

      Object.assign(event, changes);
    }

    return this.toResponse(await m.save(event));
  });
}

  // FR-EVENT-08 — DRAFT -> PUBLISHED
  async publish(id: string, user: AuthUser) {
    return this.dataSource.transaction(async (m) => {
      const event = await this.lockAndGet(m, id);
      this.assertCanManage(event, user);

      if (event.status !== EventStatus.DRAFT) {
        throw new ConflictException(
          `Only DRAFT events can be published (current status: ${event.status})`,
        );
      }

      if (event.endAt <= new Date()) {
        throw new BadRequestException(
          'Cannot publish an event that has already ended',
        );
      }

      event.status = EventStatus.PUBLISHED;
      event.publishedAt = new Date();

      return this.toResponse(await m.save(event));
    });
  }

  // FR-EVENT-07 — cancel (soft): history is kept, sales are blocked by CapacityService
  async cancel(id: string, user: AuthUser) {
    return this.dataSource.transaction(async (m) => {
      const event = await this.lockAndGet(m, id);
      this.assertCanManage(event, user);

      if (event.status === EventStatus.CANCELLED) {
        throw new ConflictException('Event is already cancelled');
      }

      event.status = EventStatus.CANCELLED;
      event.cancelledAt = new Date();

      return this.toResponse(await m.save(event));
    });
  }

  // ---------- helpers ----------

  private async paginate(
    qb: SelectQueryBuilder<Event>,
    q: QueryEventsDto,
  ) {
    if (q.search) {
      qb.andWhere(
        '(e.title ILIKE :s OR e.description ILIKE :s OR e.venue ILIKE :s)',
        { s: `%${q.search}%` },
      );
    }

    if (q.location) {
      qb.andWhere(
        '(e.location ILIKE :loc OR e.venue ILIKE :loc)',
        { loc: `%${q.location}%` },
      );
    }

    if (q.from) {
      qb.andWhere('e.startAt >= :from', { from: q.from });
    }

    if (q.to) {
      qb.andWhere('e.startAt <= :to', { to: q.to });
    }

    if (q.availableOnly) {
      qb.andWhere('e.ticketsIssued < e.capacity');
    }

    const [items, total] = await qb
      .orderBy('e.startAt', 'ASC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return {
      data: items.map((e) => this.toResponse(e)),
      meta: {
        total,
        page: q.page,
        limit: q.limit,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }

  private async lockAndGet(m: EntityManager, id: string) {
    const event = await m.findOne(Event, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  private canManage(event: Event, user: AuthUser) {
    return (
      user.role === UserRole.ADMIN ||
      event.organizerId === user.userId
    );
  }

  // FR-EVENT-09 — ownership check (role check is done by RolesGuard on the route)
  private assertCanManage(event: Event, user: AuthUser) {
    if (!this.canManage(event, user)) {
      throw new ForbiddenException(
        'You do not have permission to manage this event',
      );
    }
  }

  private validateDates(start: Date, end: Date) {
    if (end <= start) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  // FR-CAP-03 — every event response carries remaining availability
  private toResponse(e: Event) {
    return {
      ...e,
      remainingTickets: Math.max(e.capacity - e.ticketsIssued, 0),
    };
  }
}
