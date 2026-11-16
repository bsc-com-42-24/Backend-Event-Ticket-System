import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/user-role.enum';
import { Ticket } from './entities/ticket.entity';
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
          tickets_issued: 0,
        },
      ])
      .mockResolvedValueOnce([
        { ticket_type_id: '11', type_name: 'Standard', quantity_total: 2 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.generateTickets('7', {
      userId: '5',
      email: 'manager@example.com',
      role: UserRole.EVENT_MANAGER,
    });

    expect(result).toMatchObject({
      ticketsIssued: 2,
      newlyCreated: 2,
      ticketTypes: [{ ticketTypeId: '11', created: 2, total: 2 }],
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('tickets_issued = tickets_issued + $1'),
      [2, '7'],
    );
  });

  it('checks a valid QR ticket in and records the result', async () => {
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
          event_start_at: new Date('2027-01-01T18:00:00.000Z'),
          event_end_at: new Date('2027-01-01T22:00:00.000Z'),
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
      undefined,
      undefined,
      UserRole.ADMIN,
    );

    expect(result).toMatchObject({
      accepted: true,
      ticketId: '5',
      eventId: '7',
      validatedAt: checkedInAt,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ticket_validations'),
      ['5', '19', null, 'ACCEPTED', null],
    );
  });
});
