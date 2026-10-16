import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketValidationReason } from './enums/ticket-validation-reason.enum';
jest.mock('./qr-code/qr-code.service', () => ({
  QrCodeService: class QrCodeService {},
}));
import { QrCodeService } from './qr-code/qr-code.service';
import { TicketsService } from './tickets.service';

const validationTicket = {
  ticket_id: '5',
  event_id: '7',
  ticket_status: 'ISSUED',
  event_status: 'PUBLISHED',
};

describe('TicketsService', () => {
  let service: TicketsService;
  const repo = { findOne: jest.fn(), find: jest.fn() };
  const qr = {
    generateQrCode: jest.fn().mockResolvedValue('data:image/png;base64,x'),
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
      ticketId: '5',
      eventId: '7',
      validatedAt: checkedInAt,
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
