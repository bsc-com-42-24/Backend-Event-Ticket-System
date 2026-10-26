import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { UserRole } from '../users/user-role.enum';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { TicketTypesService } from './ticket-types.service';

describe('TicketTypesService', () => {
  let service: TicketTypesService;
  const client = { query: jest.fn(), release: jest.fn() };
  const database = {
    getClient: jest.fn().mockResolvedValue(client),
    query: jest.fn(),
  };
  const owner = { userId: '12', email: 'manager@example.com', role: UserRole.EVENT_MANAGER };
  const ticketType: CreateTicketTypeDto = {
    name: 'Standard',
    price: 20,
    currency: 'MWK',
    quantity: 10,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    database.getClient.mockResolvedValue(client);
    const module = await Test.createTestingModule({
      providers: [
        TicketTypesService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();
    service = module.get(TicketTypesService);
  });

  it('rejects ticket type allocation that exceeds event capacity', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ event_id: '7', organizer_id: '12', capacity: 15 }] })
      .mockResolvedValueOnce({ rows: [{ allocated: '10' }] })
      .mockResolvedValueOnce({});

    await expect(service.create('7', ticketType, owner)).rejects.toThrow(
      ConflictException,
    );
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ticket_types'),
      expect.anything(),
    );
  });

  it('rejects a manager who does not own the event', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ event_id: '7', organizer_id: '99', capacity: 15 }] })
      .mockResolvedValueOnce({});

    await expect(service.create('7', ticketType, owner)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('calculates revenue only from paid order items', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ event_id: '7', organizer_id: '12', capacity: 15 }],
      })
      .mockResolvedValueOnce({
        rows: [{
          ticket_type_id: '3',
          type_name: 'Standard',
          currency: 'MWK',
          sold: 2,
          reserved: 1,
          remaining: 7,
          revenue: '40',
        }],
      });

    const summary = await service.getSalesSummary('7', owner);

    expect(database.query.mock.calls[1][0]).toContain(
      "FILTER (WHERE o.status = 'PAID')",
    );
    expect(summary.ticketTypes[0].revenue).toBe(40);
    expect(summary.totals.revenueByCurrency).toEqual({ MWK: 40 });
  });
});
