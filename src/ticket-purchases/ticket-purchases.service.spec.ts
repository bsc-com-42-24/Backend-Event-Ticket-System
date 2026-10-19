import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TicketPurchasesService } from './ticket-purchases.service';
import { DatabaseService } from '../database/database.service';

describe('TicketPurchasesService', () => {
  let service: TicketPurchasesService;
  const client = { query: jest.fn(), release: jest.fn() };
  const databaseService = { getClient: jest.fn().mockResolvedValue(client) };

  const ticketRow = {
    ticket_type_id: 1,
    price: '100.00',
    currency: 'MWK',
    per_order_limit: 10,
    is_active: true,
    sales_start_at: null,
    sales_end_at: null,
    available: 5,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    databaseService.getClient.mockResolvedValue(client);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketPurchasesService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    service = module.get(TicketPurchasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws NotFound when the ticket type does not exist', async () => {
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      service.purchaseTickets('1', { ticketTypeId: 99, quantity: 1 }),
    ).rejects.toThrow(NotFoundException);
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects when not enough tickets are available', async () => {
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [ticketRow] }) // SELECT
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      service.purchaseTickets('1', { ticketTypeId: 1, quantity: 6 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a PENDING order and reserves tickets', async () => {
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [ticketRow] }) // SELECT
      .mockResolvedValueOnce({}) // UPDATE reserved
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: '7',
            order_number: 'ORD-TEST',
            status: 'PENDING',
            total_amount: '200.00',
            currency: 'MWK',
            expires_at: new Date(),
          },
        ],
      }) // INSERT order
      .mockResolvedValueOnce({}) // INSERT item
      .mockResolvedValueOnce({}); // COMMIT

    const result = await service.purchaseTickets('1', {
      ticketTypeId: 1,
      quantity: 2,
    });

    expect(result.status).toBe('PENDING');
    expect(result.totalAmount).toBe(200);
    expect(client.release).toHaveBeenCalled();
  });
});