import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';
import { CapacityService } from './capacity.service';

describe('CapacityService', () => {
  let service: CapacityService;
  const repository = { findOne: jest.fn() };
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CapacityService,
        { provide: getRepositoryToken(Event), useValue: repository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(CapacityService);
    repository.findOne.mockResolvedValue({
      id: '1',
      status: EventStatus.PUBLISHED,
      startAt: new Date(Date.now() + 60_000),
      endAt: new Date(Date.now() + 120_000),
      capacity: 20,
      ticketsIssued: 4,
    });
  });

  it('counts only generated tickets as claimable and flags inventory needing generation', async () => {
    dataSource.query.mockResolvedValue([
      {
        ticket_type_id: '2',
        type_name: 'Standard',
        price: '0',
        currency: 'MWK',
        quantity_total: '10',
        quantity_sold: '0',
        quantity_reserved: '0',
        configured_remaining: '10',
        generated_remaining: '0',
        sales_start_at: null,
        sales_end_at: null,
      },
      {
        ticket_type_id: '3',
        type_name: 'VIP',
        price: '100',
        currency: 'MWK',
        quantity_total: '10',
        quantity_sold: '0',
        quantity_reserved: '0',
        configured_remaining: '10',
        generated_remaining: '4',
        sales_start_at: null,
        sales_end_at: null,
      },
    ]);

    const availability = await service.getAvailability('1');

    expect(availability).toMatchObject({
      remainingTickets: 4,
      soldOut: false,
      needsGeneration: true,
    });
    expect(availability.ticketTypes[0]).toMatchObject({
      configuredRemaining: 10,
      generatedRemaining: 0,
      remaining: 0,
      needsGeneration: true,
      salesOpen: false,
    });
    expect(availability.ticketTypes[1]).toMatchObject({
      generatedRemaining: 4,
      remaining: 4,
      lowStock: true,
      salesOpen: true,
    });
  });
});
