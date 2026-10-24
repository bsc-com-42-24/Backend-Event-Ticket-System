import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketValidationReason } from './enums/ticket-validation-reason.enum';
import { UserRole } from '../users/user-role.enum';
jest.mock('./qr-code/qr-code.service', () => ({
  QrCodeService: class QrCodeService {},
}));
import { QrCodeService } from './qr-code/qr-code.service';
import { TicketsService } from './tickets.service';

const validationTicket = {
  ticket_id: '5',
  ticket_number: 'TKT-7F3A92C14B',
  event_id: '7',
  ticket_status: 'ISSUED',
  checked_in_at: null,
  event_status: 'PUBLISHED',
  event_title: 'Launch Party',
  event_venue: 'Main Hall',
  event_location: 'Blantyre',
  event_start_at: new Date('2026-01-01T18:00:00.000Z'),
  event_end_at: new Date('2026-01-01T22:00:00.000Z'),
  ticket_type_name: 'General Admission',
  owner_name: 'Jane Doe',
  organizer_id: '22',
};

describe('TicketsService', () => {
  let service: TicketsService;
  const repo = { findOne: jest.fn(), find: jest.fn() };
  const qr = {
    generateQrCode: jest.fn().mockResolvedValue('data:image/png;base64,x'),
    decodeQrCode: jest.fn().mockResolvedValue(
      '7a3d3bb5-cf46-4c52-8acf-389ccadf440a',
    ),
  };
  const manager = { query: jest.fn() };
  const dataSource = {
    transaction: jest.fn(),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const owner = { userId: '5', email: 'a@b.com', role: 'ATTENDEE' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
        { provide: QrCodeService, useValue: qr },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(TicketsService);
    dataSource.transaction.mockImplementation(
      (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    );
    manager.query.mockReset();
    dataSource.query.mockReset().mockResolvedValue(undefined);
  });

  it('decodes an uploaded QR image and validates its ticket token', async () => {
    manager.query
      .mockResolvedValueOnce([validationTicket])
      .mockResolvedValueOnce([
        {
          ticket_id: '5',
          event_id: '7',
          checked_in_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

    await service.validateTicketImage(
      Buffer.from('image bytes'),
      '19',
      '7',
      UserRole.VALIDATOR,
    );

    expect(qr.decodeQrCode).toHaveBeenCalledWith(Buffer.from('image bytes'));
    expect(manager.query.mock.calls[0][1]).toEqual([
      '7a3d3bb5-cf46-4c52-8acf-389ccadf440a',
    ]);
  });

  it('rejects QR images that do not contain a ticket UUID', async () => {
    qr.decodeQrCode.mockResolvedValueOnce('not-a-ticket-token');

    await expect(
      service.validateTicketImage(Buffer.from('image bytes'), '19'),
    ).rejects.toThrow('The QR code does not contain a valid ticket token.');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('hides a ticket from someone who does not own it', async () => {
    repo.findOne.mockResolvedValue({ ownerId: '9', qrToken: 't' });
    await expect(service.getTicket('TKT-1', owner)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('encodes the qr_token, not the ticket number', async () => {
    repo.findOne.mockResolvedValue({
      ownerId: '5',
      ticketNumber: 'TKT-1',
      qrToken: 'secret-uuid',
    });
    const result = await service.getTicketWithQrCode('TKT-1', owner);
    expect(qr.generateQrCode).toHaveBeenCalledWith('secret-uuid');
    expect(result.qrCode).toContain('data:image/png');
  });

  it.each([
    [TicketValidationReason.NOT_FOUND, []],
    [
      TicketValidationReason.ALREADY_USED,
      [{ ...validationTicket, ticket_status: 'USED' }],
    ],
    [
      TicketValidationReason.CANCELLED,
      [{ ...validationTicket, ticket_status: 'CANCELLED' }],
    ],
    [TicketValidationReason.WRONG_EVENT, [validationTicket]],
    [
      TicketValidationReason.EVENT_CANCELLED,
      [{ ...validationTicket, event_status: 'CANCELLED' }],
    ],
  ])('rejects with reason %s and records the attempt', async (reason, rows) => {
    manager.query.mockResolvedValueOnce(rows);

    const result = await service.validateTicket(
      'qr-token',
      '19',
      reason === TicketValidationReason.WRONG_EVENT ? '8' : '7',
    );

    expect(result).toMatchObject({
      accepted: false,
      reason,
      validatedAt: null,
    });
    expect(result.message).toBe(
      {
        [TicketValidationReason.NOT_FOUND]: 'Ticket not found.',
        [TicketValidationReason.ALREADY_USED]:
          'This ticket has already been used.',
        [TicketValidationReason.CANCELLED]:
          'This ticket is cancelled or refunded.',
        [TicketValidationReason.WRONG_EVENT]:
          'This ticket is for a different event.',
        [TicketValidationReason.EVENT_CANCELLED]:
          'This event has been cancelled.',
      }[reason],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ticket_validations'),
      [
        result.ticketId,
        '19',
        reason === TicketValidationReason.NOT_FOUND
          ? '7'
          : reason === TicketValidationReason.WRONG_EVENT
            ? '8'
            : '7',
        'REJECTED',
        reason,
      ],
    );
  });

  it('accepts a manually entered ticket number', async () => {
    const checkedInAt = new Date('2026-01-01T00:00:00.000Z');
    manager.query
      .mockResolvedValueOnce([validationTicket])
      .mockResolvedValueOnce([
        { ticket_id: '5', event_id: '7', checked_in_at: checkedInAt },
      ]);

    const result = await service.validateTicket(
      undefined,
      '19',
      '7',
      'TKT-7F3A92C14B',
    );

    expect(manager.query.mock.calls[0][0]).toContain(
      'WHERE t.ticket_number = $1',
    );
    expect(manager.query.mock.calls[0][1]).toEqual(['TKT-7F3A92C14B']);
    expect(result).toMatchObject({
      accepted: true,
      message: 'Ticket accepted. Admit guest.',
    });
  });

  it('requires exactly one ticket lookup method', async () => {
    await expect(service.validateTicket(undefined, '19')).rejects.toThrow(
      'Provide exactly one of qrToken or ticketNumber',
    );
    await expect(
      service.validateTicket('qr-token', '19', undefined, 'TKT-123'),
    ).rejects.toThrow('Provide exactly one of qrToken or ticketNumber');
  });

  it('accepts an unused ticket with one conditional update and records the attempt', async () => {
    const checkedInAt = new Date('2026-01-01T00:00:00.000Z');
    manager.query
      .mockResolvedValueOnce([validationTicket])
      .mockResolvedValueOnce([
        { ticket_id: '5', event_id: '7', checked_in_at: checkedInAt },
      ]);

    const result = await service.validateTicket('qr-token', '19', '7');

    expect(result).toEqual({
      accepted: true,
      reason: null,
      message: 'Ticket accepted. Admit guest.',
      ticketId: '5',
      eventId: '7',
      validatedAt: checkedInAt,
      ticket: {
        id: '5',
        ticketNumber: 'TKT-7F3A92C14B',
        status: 'USED',
        checkedInAt,
        ticketType: 'General Admission',
        ownerName: 'Jane Doe',
      },
      event: {
        id: '7',
        title: 'Launch Party',
        venue: 'Main Hall',
        location: 'Blantyre',
        startAt: new Date('2026-01-01T18:00:00.000Z'),
        endAt: new Date('2026-01-01T22:00:00.000Z'),
        status: 'PUBLISHED',
      },
    });
    expect(manager.query.mock.calls[1][0]).toContain(
      "WHERE ticket_id = $1 AND status = 'ISSUED'",
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ticket_validations'),
      ['5', '19', '7', 'ACCEPTED', null],
    );
  });

  it('keeps the validation result when audit logging fails', async () => {
    manager.query
      .mockResolvedValueOnce([validationTicket])
      .mockResolvedValueOnce([
        {
          ticket_id: '5',
          event_id: '7',
          checked_in_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
    dataSource.query.mockRejectedValueOnce(new Error('audit unavailable'));
    const logError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation();

    const result = await service.validateTicket('qr-token', '19');

    expect(result.accepted).toBe(true);
    expect(logError).toHaveBeenCalledWith(
      'Failed to record ticket validation attempt',
      expect.any(String),
    );
  });

  it('keeps a rejection reason when audit logging fails', async () => {
    manager.query.mockResolvedValueOnce([
      { ...validationTicket, ticket_status: 'USED' },
    ]);
    dataSource.query.mockRejectedValueOnce(new Error('audit unavailable'));
    jest.spyOn(service['logger'], 'error').mockImplementation();

    const result = await service.validateTicket('qr-token', '19');

    expect(result).toMatchObject({
      accepted: false,
      reason: TicketValidationReason.ALREADY_USED,
    });
  });

  it('does not allow a manager to validate tickets for another organizer', async () => {
    manager.query.mockResolvedValueOnce([
      { ...validationTicket, organizer_id: '22' },
    ]);

    await expect(
      service.validateTicket(
        'qr-token',
        '19',
        undefined,
        undefined,
        UserRole.EVENT_MANAGER,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns event check-in progress to its manager', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        event_id: '7',
        title: 'Launch Party',
        tickets_issued: 50,
        checked_in: 18,
      },
    ]);

    await expect(
      service.getCheckInSummary('7', {
        userId: '19',
        email: 'manager@example.com',
        role: UserRole.EVENT_MANAGER,
      }),
    ).resolves.toEqual({
      eventId: '7',
      eventTitle: 'Launch Party',
      ticketsIssued: 50,
      checkedIn: 18,
      remaining: 32,
    });
  });

  it('allows only one of two concurrent scans to validate the same ticket', async () => {
    let status = 'ISSUED';
    let transactionQueue = Promise.resolve();
    const transactionalManager = {
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SELECT')) {
          return [{ ...validationTicket, ticket_status: status }];
        }
        if (sql.startsWith('UPDATE')) {
          if (status !== 'ISSUED') return [];
          status = 'USED';
          return [
            {
              ticket_id: '5',
              event_id: '7',
              checked_in_at: new Date('2026-01-01T00:00:00.000Z'),
            },
          ];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    dataSource.transaction.mockImplementation(
      (
        callback: (transactionManager: typeof transactionalManager) => unknown,
      ) => {
        const previous = transactionQueue;
        let release: () => void = () => undefined;
        transactionQueue = new Promise<void>((resolve) => {
          release = resolve;
        });
        return previous.then(async () => {
          try {
            return await callback(transactionalManager);
          } finally {
            release();
          }
        });
      },
    );

    const results = await Promise.all([
      service.validateTicket('qr-token', '19'),
      service.validateTicket('qr-token', '20'),
    ]);

    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.find((result) => !result.accepted)?.reason).toBe(
      TicketValidationReason.ALREADY_USED,
    );
    expect(
      transactionalManager.query.mock.calls
        .filter(([sql]) => sql.startsWith('SELECT'))
        .every(([sql]) => sql.includes('FOR UPDATE OF t, e')),
    ).toBe(true);
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });
});
