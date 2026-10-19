import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
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
    @InjectRepository(Event) private readonly repo: Repository<Event>,
    private readonly dataSource: DataSource,
  ) {}

  // FR-EVENT-01, 02, 10 — new events always start as DRAFT, owned by the creator
  async create(dto: CreateEventDto, user: AuthUser) {
    this.validateDates(dto.startAt, dto.endAt);
    if (dto.startAt <= new Date()) {
      throw new BadRequestException('startAt must be in the future');
    }
    const event = this.repo.create({
      ...dto,
      ticketsIssued: 0,
      status: EventStatus.DRAFT,
      organizerId: user.userId,
    });
    return this.toResponse(await this.repo.save(event));
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
    if (q.status) qb.andWhere('e.status = :st', { st: q.status });
    return this.paginate(qb, q);
  }

  // FR-EVENT-05 — details incl. remaining availability. DRAFTs are visible to owner/admin only.
  async findOne(id: string, user?: AuthUser | null) {
    const event = await this.repo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status === EventStatus.DRAFT && !(user && this.canManage(event, user))) {
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

      const changes = Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      );
      const startAt = dto.startAt ?? event.startAt;
      const endAt = dto.endAt ?? event.endAt;

      this.validateDates(startAt, endAt);
      if (dto.startAt && dto.startAt <= new Date()) {
        throw new BadRequestException('startAt must be in the future');
      }
      if (endAt <= new Date()) {
        throw new BadRequestException('endAt must be in the future');
      }
      // FR-CAP-06: can never drop capacity below what is already issued
      if (dto.capacity !== undefined && dto.capacity < event.ticketsIssued) {
        throw new ConflictException(
          `Capacity cannot be lower than tickets already issued (${event.ticketsIssued})`,
        );
      }

      Object.assign(event, changes);
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
        throw new BadRequestException('Cannot publish an event that has already ended');
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

  private async paginate(qb: SelectQueryBuilder<Event>, q: QueryEventsDto) {
    if (q.search) {
      qb.andWhere('(e.title ILIKE :s OR e.description ILIKE :s OR e.venue ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }
    if (q.location) {
      qb.andWhere('(e.location ILIKE :loc OR e.venue ILIKE :loc)', { loc: `%${q.location}%` });
    }
    if (q.from) qb.andWhere('e.startAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('e.startAt <= :to', { to: q.to });
    if (q.availableOnly) qb.andWhere('e.ticketsIssued < e.capacity');

    const [items, total] = await qb
      .orderBy('e.startAt', 'ASC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return {
      data: items.map((e) => this.toResponse(e)),
      meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) },
    };
  }

  private async lockAndGet(m: EntityManager, id: string) {
    const event = await m.findOne(Event, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private canManage(event: Event, user: AuthUser) {
    return user.role === UserRole.ADMIN || event.organizerId === user.userId;
  }

  // FR-EVENT-09 — ownership check (role check is done by RolesGuard on the route)
  private assertCanManage(event: Event, user: AuthUser) {
    if (!this.canManage(event, user)) {
      throw new ForbiddenException('You do not have permission to manage this event');
    }
  }

  private validateDates(start: Date, end: Date) {
    if (end <= start) throw new BadRequestException('endAt must be after startAt');
  }

  // FR-CAP-03 — every event response carries remaining availability
  private toResponse(e: Event) {
    return { ...e, remainingTickets: Math.max(e.capacity - e.ticketsIssued, 0) };
  }
}
