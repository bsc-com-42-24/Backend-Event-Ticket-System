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

  it('reports low-stock warnings without inventing revenue', async () => {
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
          configured_remaining: 7,
          generated_remaining: 7,
          remaining: 7,
          quantity: 10,
          is_active: true,
        }],
      });

    const summary = await service.getSalesSummary('7', owner);

    expect(database.query.mock.calls[1][0]).not.toContain('order_items');
    expect(summary.ticketTypes[0]).toMatchObject({
      revenue: null,
      configuredRemaining: 7,
      generatedRemaining: 7,
      inventoryStatus: 'LOW_STOCK',
    });
    expect(summary.totals.revenueByCurrency).toBeNull();
    expect(summary.paymentTracking).toBe('NOT_CONFIGURED');
    expect(summary.warnings).toEqual([
      {
        ticketTypeId: '3',
        name: 'Standard',
        configuredRemaining: 7,
        generatedRemaining: 7,
        remaining: 7,
        inventoryStatus: 'LOW_STOCK',
      },
    ]);
  });

  it('distinguishes ungenerated inventory from sold-out inventory', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ event_id: '7', organizer_id: '12', capacity: 15 }],
      })
      .mockResolvedValueOnce({
        rows: [{
          ticket_type_id: '3',
          type_name: 'Standard',
          currency: 'MWK',
          sold: 0,
          reserved: 0,
          configured_remaining: 10,
          generated_remaining: 0,
          remaining: 0,
          quantity: 10,
          is_active: true,
        }],
      });

    const summary = await service.getSalesSummary('7', owner);

    expect(summary.ticketTypes[0]).toMatchObject({
      configuredRemaining: 10,
      generatedRemaining: 0,
      remaining: 0,
      inventoryStatus: 'NEEDS_GENERATION',
    });
  });
});
