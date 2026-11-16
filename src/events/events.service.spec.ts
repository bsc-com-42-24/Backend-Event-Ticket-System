import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/user-role.enum';
import { Event } from './entities/event.entity';
import { EventStatus } from './enums/event-status.enum';
import { QueryEventsDto } from './dto/query-events.dto';
import { EventsService } from './events.service';

describe('EventsService', () => {
  it('filters public event results by a case-insensitive keyword', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new EventsService(repository as never, {} as never);
    const query = Object.assign(new QueryEventsDto(), { search: 'launch' });

    await service.findPublished(query);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(e.title ILIKE :s OR e.description ILIKE :s OR e.venue ILIKE :s OR e.location ILIKE :s)',
      { s: '%launch%' },
    );
  });

  const future = new Date('2099-03-10T16:00:00.000Z');
  const event: Event = {
    id: '7',
    organizerId: '5',
    title: 'Launch',
    description: 'Launch event',
    venue: 'Main Hall',
    location: 'Blantyre',
    startAt: future,
    endAt: new Date('2099-03-10T20:00:00.000Z'),
    capacity: 100,
    ticketsIssued: 0,
    status: EventStatus.DRAFT,
    publishedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  let service: EventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(event, {
      status: EventStatus.DRAFT,
      publishedAt: null,
    });
    dataSource.transaction.mockImplementation(
      (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    );
    manager.findOne.mockResolvedValue(event);
    manager.save.mockImplementation(async (savedEvent: Event) => savedEvent);
    service = new EventsService(
      {} as never,
      dataSource as unknown as DataSource,
    );
  });

  it('publishes a draft as part of the event update', async () => {
    const result = await service.update(
      '7',
      { status: EventStatus.PUBLISHED },
      {
        userId: '5',
        email: 'manager@example.com',
        role: UserRole.EVENT_MANAGER,
      },
    );

    expect(result.status).toBe(EventStatus.PUBLISHED);
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(manager.save).toHaveBeenCalledWith(event);
  });

  it('does not allow a published event to return to draft', async () => {
    event.status = EventStatus.PUBLISHED;

    await expect(
      service.update(
        '7',
        { status: EventStatus.DRAFT },
        {
          userId: '5',
          email: 'manager@example.com',
          role: UserRole.EVENT_MANAGER,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not let another organizer publish the event', async () => {
    await expect(
      service.update(
        '7',
        { status: EventStatus.PUBLISHED },
        {
          userId: '9',
          email: 'other@example.com',
          role: UserRole.EVENT_MANAGER,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
