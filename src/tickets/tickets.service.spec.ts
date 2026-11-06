import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/user-role.enum';
import { Ticket } from './entities/ticket.entity';
import { TicketValidationReason } from './enums/ticket-validation-reason.enum';
import { QrCodeService } from './qr-code/qr-code.service';
import { TicketsService } from './tickets.service';

describe('TicketsService', () => {
  let service: TicketsService;
  const repository = { find: jest.fn(), findOne: jest.fn() };
  const qrCodeService = {
    generateQrCode: jest.fn().mockResolvedValue('data:image/png;base64,test'),
    decodeQrCode: jest.fn(),
  };
  const manager = { query: jest.fn() };
  const dataSource = {
    transaction: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    dataSource.transaction.mockImplementation(
      (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    );
    dataSource.query.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repository },
        { provide: QrCodeService, useValue: qrCodeService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(TicketsService);
  });

  it('creates only missing tickets and updates the event counter', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          event_id: '7',
          organizer_id: '5',
          status: 'DRAFT',
          capacity: 10,
          tickets_issued: 2,
        },
      ])
      .mockResolvedValueOnce([
        { ticket_type_id: '11', type_name: 'Standard', quantity_total: 3 },
      ])
      .mockResolvedValueOnce([{ ticket_type_id: '11', n: 2 }])
      .mockResolvedValueOnce([]);

    const result = await service.generateTickets('7', {
      userId: '5',
      email: 'manager@example.com',
      role: UserRole.EVENT_MANAGER,
    });

    expect(result).toMatchObject({
      ticketsIssued: 3,
      newlyCreated: 1,
      ticketTypes: [{ ticketTypeId: '11', created: 1, total: 3 }],
    });
    expect(manager.query.mock.calls[3][1][0]).toHaveLength(1);
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('tickets_issued = tickets_issued + $1'),
      [1, '7'],
    );
  });

  it('rejects ticket generation for a manager who does not own the event', async () => {
    manager.query.mockResolvedValueOnce([
      {
        event_id: '7',
        organizer_id: '99',
        status: 'DRAFT',
        capacity: 10,
        tickets_issued: 0,
      },
    ]);

    await expect(
      service.generateTickets('7', {
        userId: '5',
        email: 'manager@example.com',
        role: UserRole.EVENT_MANAGER,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('validates QR payloads that bind the ticket ID to its secret token', async () => {
    const checkedInAt = new Date('2026-01-01T00:00:00.000Z');
    manager.query
      .mockResolvedValueOnce([
        {
          ticket_id: '5',
          ticket_number: 'TKT-7F3A92C14B',
          event_id: '7',
          ticket_status: 'ISSUED',
          checked_in_at: null,
          event_status: 'PUBLISHED',
          organizer_id: '22',
          event_title: 'Launch Party',
          event_venue: 'Main Hall',
          event_location: 'Blantyre',
          event_start_at: new Date('2026-01-01T18:00:00.000Z'),
          event_end_at: new Date('2026-01-01T22:00:00.000Z'),
          ticket_type_name: 'General Admission',
          owner_name: 'Jane Doe',
        },
      ])
      .mockResolvedValueOnce([
        { ticket_id: '5', event_id: '7', checked_in_at: checkedInAt },
      ]);

    const result = await service.validateTicket(
      JSON.stringify({
        ticketId: '5',
        token: '7a3d3bb5-cf46-4c52-8acf-389ccadf440a',
      }),
      '19',
      '7',
      undefined,
      UserRole.VALIDATOR,
    );

    expect(manager.query.mock.calls[0][0]).toContain(
      't.ticket_id = $1 AND t.qr_token = $2',
    );
    expect(manager.query.mock.calls[0][1]).toEqual([
      '5',
      '7a3d3bb5-cf46-4c52-8acf-389ccadf440a',
    ]);
    expect(result).toMatchObject({
      accepted: true,
      ticketId: '5',
      ticket: { id: '5', status: 'USED' },
      event: { id: '7', title: 'Launch Party' },
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ticket_validations'),
      ['5', '19', '7', 'ACCEPTED', null],
    );
  });

  it('rejects malformed QR text before querying the database', async () => {
    await expect(
      service.validateTicket('not-a-ticket-token', '19'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('does not claim paid tickets without a payment integration', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          status: 'PUBLISHED',
          start_at: new Date('2099-01-01T00:00:00.000Z'),
          end_at: new Date('2099-01-02T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          ticket_type_id: '3',
          is_active: true,
          price: '25.00',
          per_order_limit: 2,
          sales_start_at: null,
          sales_end_at: null,
        },
      ]);

    await expect(
      service.purchaseTicket('5', '7', '3', 1),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('claims free tickets within the type limit and puts the ticket ID in the QR', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          status: 'PUBLISHED',
          start_at: new Date('2099-01-01T00:00:00.000Z'),
          end_at: new Date('2099-01-02T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          ticket_type_id: '3',
          is_active: true,
          price: '0.00',
          quantity_total: 5,
          quantity_sold: 0,
          quantity_reserved: 0,
          per_order_limit: 2,
          sales_start_at: null,
          sales_end_at: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          ticket_id: '42',
          ticket_number: 'TKT-7F3A92C14B',
          qr_token: '7a3d3bb5-cf46-4c52-8acf-389ccadf440a',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ticket_type_id: '3' }]);

    const result = await service.purchaseTicket('5', '7', '3', 1);
    const qrPayload = JSON.parse(qrCodeService.generateQrCode.mock.calls[0][0]);

    expect(result).toMatchObject({
      quantity: 1,
      paymentRequired: false,
      tickets: [{ ticketId: '42', ticketNumber: 'TKT-7F3A92C14B' }],
    });
    expect(qrPayload).toEqual({
      ticketId: '42',
      token: '7a3d3bb5-cf46-4c52-8acf-389ccadf440a',
    });
  });

  it('requires exactly one ticket lookup method', async () => {
    await expect(service.validateTicket(undefined, '19')).rejects.toThrow(
      'Provide exactly one of qrToken or ticketNumber',
    );
    await expect(
      service.validateTicket('{"ticketId":"5"}', '19', undefined, 'TKT-123'),
    ).rejects.toThrow('Provide exactly one of qrToken or ticketNumber');
  });
});
