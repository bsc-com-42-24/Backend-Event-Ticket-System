import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';

@Injectable()
export class CapacityService {
  constructor(@InjectRepository(Event) private readonly repo: Repository<Event>) {}

  // FR-CAP-01/02/03
  async getAvailability(eventId: string) {
    const e = await this.repo.findOne({ where: { id: eventId } });
    if (!e || e.status === EventStatus.DRAFT) throw new NotFoundException('Event not found');
    const remaining = Math.max(e.capacity - e.ticketsIssued, 0);
    return {
      eventId: e.id,
      status: e.status,
      capacity: e.capacity,
      ticketsIssued: e.ticketsIssued,
      remainingTickets: remaining,
      soldOut: remaining === 0,
      salesOpen: e.status === EventStatus.PUBLISHED && e.endAt > new Date() && remaining > 0,
    };
  }

  /**
   * FR-CAP-04/05/06 — atomically claim `quantity` tickets.
   * ONE conditional UPDATE does the check and the increment together, so two
   * simultaneous buyers can never both take the last ticket (Postgres row lock).
   *
   * Member 4: call this INSIDE your purchase transaction, passing its manager,
   * so the counter rolls back if inserting the tickets fails:
   *   await dataSource.transaction(async (m) => {
   *     await capacityService.reserve(eventId, qty, m);
   *     ...insert tickets with m...
   *   });
   * Throws if the event is not PUBLISHED, has ended, or lacks capacity.
   */
  async reserve(eventId: string, quantity: number, manager?: EntityManager): Promise<void> {
    this.assertQuantity(quantity);
    const repo = manager ? manager.getRepository(Event) : this.repo;

    const result = await repo
      .createQueryBuilder()
      .update(Event)
      .set({ ticketsIssued: () => 'tickets_issued + :qty' })
      .where('event_id = :id', { id: eventId })
      .andWhere('status = :status', { status: EventStatus.PUBLISHED })
      .andWhere('end_at > NOW()')
      .andWhere('tickets_issued + :qty <= capacity')
      .setParameters({ qty: quantity })
      .execute();

    if (result.affected === 1) return;
    await this.explainFailure(repo, eventId);
  }

  /** Give tickets back (ticket cancelled / purchase rolled back outside a transaction). */
  async release(eventId: string, quantity: number, manager?: EntityManager): Promise<void> {
    this.assertQuantity(quantity);
    const repo = manager ? manager.getRepository(Event) : this.repo;

    const result = await repo
      .createQueryBuilder()
      .update(Event)
      .set({ ticketsIssued: () => 'tickets_issued - :qty' })
      .where('event_id = :id', { id: eventId })
      .andWhere('tickets_issued >= :qty')
      .setParameters({ qty: quantity })
      .execute();

    if (result.affected !== 1) {
      throw new ConflictException('Cannot release more tickets than were issued');
    }
  }

  private assertQuantity(q: number) {
    if (!Number.isInteger(q) || q < 1) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
  }

  private async explainFailure(repo: Repository<Event>, eventId: string): Promise<never> {
    const e = await repo.findOne({ where: { id: eventId } });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status !== EventStatus.PUBLISHED) {
      throw new ConflictException(`Tickets are not on sale: event is ${e.status}`);
    }
    if (e.endAt <= new Date()) throw new ConflictException('Tickets are not on sale: event has ended');
    const remaining = e.capacity - e.ticketsIssued;
    throw new ConflictException(
      remaining <= 0 ? 'Event is sold out' : `Only ${remaining} ticket(s) remaining`,
    );
  }
}
