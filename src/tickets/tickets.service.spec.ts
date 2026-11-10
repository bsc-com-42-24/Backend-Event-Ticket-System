
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/user-role.enum';
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

const event = {
  event_id: '7',
  organizer_id: '5',
  status: 'PUBLISHED',
  capacity: 10,
  tickets_issued: 2,
};

const ticketTypes = [
  {
    ticket_type_id: '11',
    type_name: 'Regular',
    quantity_total: 3,
  },
  {
    ticket_type_id: '12',
    type_name: 'VIP',
    quantity_total: 2,
  },
];

describe('TicketsService', () => {
  let service: TicketsService;

  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const qr = {
    generateQrCode: jest.fn().mockResolvedValue(
      'data:image/png;base64,x',
    ),
  };

  const manager = {
    query: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(),
    query: jest.fn(),
  };

  const organizer = {
    userId: '5',
    email: 'organizer@example.com',
    role: 'ORGANIZER',
  } as any;

  const otherUser = {
    userId: '9',
    email: 'other@example.com',
    role: 'ATTENDEE',
  } as any;

  const admin = {
    userId: '20',
    email: 'admin@example.com',
    role: 'ADMIN',
  } as any;

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
    dataSource.query.mockReset().mockResolvedValue([]);
  });

  describe('generateTickets', () => {
    it('creates only the missing tickets for each ticket type', async () => {
      manager.query
        .mockResolvedValueOnce([{ ...event, tickets_issued: 3 }])
        .mockResolvedValueOnce(ticketTypes)
        .mockResolvedValueOnce([
          { ticket_type_id: '11', n: 1 },
          { ticket_type_id: '12', n: 2 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.generateTickets('7', organizer);

      expect(result).toMatchObject({
        eventId: '7',
        capacity: 10,
        ticketsIssued: 5,
        newlyCreated: 2,
        ticketTypes: [
          {
            ticketTypeId: '11',
            typeName: 'Regular',
            created: 2,
            total: 3,
          },
          {
            ticketTypeId: '12',
            typeName: 'VIP',
            created: 0,
            total: 2,
          },
        ],
      });

      const insertCalls = manager.query.mock.calls.filter(
        ([sql]) => String(sql).includes('INSERT INTO tickets'),
      );

      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0][1][0]).toHaveLength(2);
      expect(insertCalls[0][1][1]).toHaveLength(2);
      expect(insertCalls[0][1][2]).toBe('7');
      expect(insertCalls[0][1][3]).toBe('11');

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['7'],
      );

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('tickets_issued = tickets_issued + $1'),
        [2, '7'],
      );
    });

    it('rejects generation that would exceed event capacity', async () => {
      manager.query
        .mockResolvedValueOnce([
          { ...event, capacity: 3, tickets_issued: 2 },
        ])
        .mockResolvedValueOnce(ticketTypes)
        .mockResolvedValueOnce([]);

      await expect(
        service.generateTickets('7', organizer),
      ).rejects.toThrow(ConflictException);

      expect(
        manager.query.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO tickets'),
        ),
      ).toBe(false);
    });

    it('rejects an organizer who does not own the event', async () => {
      manager.query.mockResolvedValueOnce([
        { ...event, organizer_id: '99' },
      ]);

      await expect(
        service.generateTickets('7', organizer),
      ).rejects.toThrow(NotFoundException);

      expect(manager.query).toHaveBeenCalledTimes(1);
    });

    it('allows an admin to generate tickets for another organizer', async () => {
      manager.query
        .mockResolvedValueOnce([
          { ...event, organizer_id: '99' },
        ])
        .mockResolvedValueOnce([ticketTypes[0]])
        .mockResolvedValueOnce([]);

      const result = await service.generateTickets('7', admin);

      expect(result.newlyCreated).toBe(3);
      expect(result.ticketsIssued).toBe(5);
    });

    it('does not create duplicate tickets when called a second time', async () => {
      manager.query
        .mockResolvedValueOnce([
          { ...event, tickets_issued: 2 },
        ])
        .mockResolvedValueOnce(ticketTypes)
        .mockResolvedValueOnce([
          { ticket_type_id: '11', n: 3 },
          { ticket_type_id: '12', n: 2 },
        ]);

      const result = await service.generateTickets('7', organizer);

      expect(result).toMatchObject({
        newlyCreated: 0,
        ticketsIssued: 2,
        ticketTypes: [
          { ticketTypeId: '11', created: 0, total: 3 },
          { ticketTypeId: '12', created: 0, total: 2 },
        ],
      });

      expect(
        manager.query.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO tickets'),
        ),
      ).toBe(false);

      expect(
        manager.query.mock.calls.some(([sql]) =>
          String(sql).includes('tickets_issued = tickets_issued + $1'),
        ),
      ).toBe(false);
    });

    it('rejects generation when the event does not exist', async () => {
      manager.query.mockResolvedValueOnce([]);

      await expect(
        service.generateTickets('999', organizer),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects generation when there are no active ticket types', async () => {
      manager.query
        .mockResolvedValueOnce([{ ...event, tickets_issued: 2 }])
        .mockResolvedValueOnce([]);

      await expect(
        service.generateTickets('7', organizer),
      ).rejects.toThrow(ConflictException);
    });

    it.each(['CANCELLED', 'COMPLETED'])(
      'rejects generation for a %s event',
      async (status) => {
        manager.query.mockResolvedValueOnce([
          { ...event, status },
        ]);

        await expect(
          service.generateTickets('7', organizer),
        ).rejects.toThrow(ConflictException);
      },
    );
  });

  describe('ticket access', () => {
    it('hides a ticket from someone who cannot manage its event', async () => {
      repo.findOne.mockResolvedValue({
        eventId: '7',
        ticketNumber: 'TKT-1',
        qrToken: 'secret',
      });

      dataSource.query.mockResolvedValueOnce([
        { organizer_id: '5' },
      ]);

      await expect(
        service.getTicket('TKT-1', otherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the event organizer to retrieve a ticket QR code', async () => {
      repo.findOne.mockResolvedValue({
        eventId: '7',
        ticketNumber: 'TKT-1',
        qrToken: 'secret-uuid',
      });

      dataSource.query.mockResolvedValueOnce([
        { organizer_id: '5' },
      ]);

      const result = await service.getTicketWithQrCode(
        'TKT-1',
        organizer,
      );

      expect(qr.generateQrCode).toHaveBeenCalledWith(
        'secret-uuid',
      );
      expect(result.qrCode).toContain('data:image/png');
    });

    it('allows an admin to retrieve a ticket QR code', async () => {
      repo.findOne.mockResolvedValue({
        eventId: '7',
        ticketNumber: 'TKT-1',
        qrToken: 'secret-uuid',
      });

      dataSource.query.mockResolvedValueOnce([
        { organizer_id: '5' },
      ]);

      const result = await service.getTicketWithQrCode(
        'TKT-1',
        admin,
      );

      expect(qr.generateQrCode).toHaveBeenCalledWith(
        'secret-uuid',
      );
      expect(result.ticket.ticketNumber).toBe('TKT-1');
    });

    it('returns not found when the ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.getTicket('MISSING', organizer),
      ).rejects.toThrow(NotFoundException);

      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('validateTicket - event assignment for check-in staff', () => {
    const staffId = '31';

    it('accepts a ticket for an event the staff member is assigned to', async () => {
      const checkedInAt = new Date('2026-01-01T00:00:00.000Z');
      manager.query
        .mockResolvedValueOnce([validationTicket]) // ticket lookup
        .mockResolvedValueOnce([{ '?column?': 1 }]) // assignment found
        .mockResolvedValueOnce([
          { ticket_id: '5', event_id: '7', checked_in_at: checkedInAt },
        ]); // conditional update

      const result = await service.validateTicket(
        'qr-token',
        staffId,
        '7',
        UserRole.VALIDATOR,
      );

      expect(result).toMatchObject({ accepted: true, eventId: '7' });
      // assignment is looked up for exactly this staff member and this ticket's event
      expect(manager.query.mock.calls[1][0]).toContain(
        'staff_event_assignments',
      );
      expect(manager.query.mock.calls[1][1]).toEqual([staffId, '7']);
    });

    it('rejects a ticket for an event the staff member is NOT assigned to, without marking it used', async () => {
      manager.query
        .mockResolvedValueOnce([validationTicket])
        .mockResolvedValueOnce([]); // no assignment

      const result = await service.validateTicket(
        'qr-token',
        staffId,
        '7',
        UserRole.VALIDATOR,
      );

      expect(result).toEqual({
        accepted: false,
        reason: TicketValidationReason.NOT_ASSIGNED,
        // nothing about the ticket is revealed to an unassigned scanner
        ticketId: null,
        eventId: null,
        validatedAt: null,
      });
      // lookup + assignment check only: the UPDATE that marks the ticket USED never runs
      expect(manager.query).toHaveBeenCalledTimes(2);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_validations'),
        [null, staffId, '7', 'REJECTED', TicketValidationReason.NOT_ASSIGNED],
      );
    });

    it('does not reveal that a ticket was already used to an unassigned staff member', async () => {
      manager.query
        .mockResolvedValueOnce([{ ...validationTicket, ticket_status: 'USED' }])
        .mockResolvedValueOnce([]);

      const result = await service.validateTicket(
        'qr-token',
        staffId,
        undefined,
        UserRole.VALIDATOR,
      );

      expect(result.reason).toBe(TicketValidationReason.NOT_ASSIGNED);
    });

    it('fails closed: with no role given it enforces the assignment', async () => {
      manager.query
        .mockResolvedValueOnce([validationTicket])
        .mockResolvedValueOnce([]);

      const result = await service.validateTicket('qr-token', staffId, '7');

      expect(result.reason).toBe(TicketValidationReason.NOT_ASSIGNED);
    });

    it('lets an admin validate any event without an assignment lookup', async () => {
      manager.query
        .mockResolvedValueOnce([validationTicket])
        .mockResolvedValueOnce([
          {
            ticket_id: '5',
            event_id: '7',
            checked_in_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]);

      const result = await service.validateTicket(
        'qr-token',
        '20',
        '7',
        UserRole.ADMIN,
      );

      expect(result.accepted).toBe(true);
      expect(manager.query).toHaveBeenCalledTimes(2);
      expect(manager.query.mock.calls[1][0]).not.toContain(
        'staff_event_assignments',
      );
    });

    it('scanTicket returns no ticket details to an unassigned staff member', async () => {
      manager.query
        .mockResolvedValueOnce([validationTicket])
        .mockResolvedValueOnce([]);

      const result = await service.scanTicket(
        'qr-token',
        staffId,
        '7',
        UserRole.VALIDATOR,
      );

      expect(result).toMatchObject({
        accepted: false,
        reason: TicketValidationReason.NOT_ASSIGNED,
        details: null,
      });
      // no customer name/email lookup happened
      expect(dataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining('JOIN ticket_types'),
        expect.anything(),
      );
    });
  });

  describe('validateTicket', () => {
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
    ])(
      'rejects with reason %s and records the attempt',
      async (reason, rows) => {
        manager.query.mockResolvedValueOnce(rows);

        const result = await service.validateTicket(
          'qr-token',
          '19',
          reason === TicketValidationReason.WRONG_EVENT ? '8' : '7',
          UserRole.ADMIN,
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
      },
    );

    it('accepts an unused ticket with one conditional update and records the attempt', async () => {
      const checkedInAt = new Date('2026-01-01T00:00:00.000Z');

      manager.query
        .mockResolvedValueOnce([validationTicket])
        .mockResolvedValueOnce([
          {
            ticket_id: '5',
            event_id: '7',
            checked_in_at: checkedInAt,
          },
        ]);

      const result = await service.validateTicket(
        'qr-token',
        '19',
        '7',
        UserRole.ADMIN,
      );

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

      dataSource.query.mockRejectedValueOnce(
        new Error('audit unavailable'),
      );

      const logError = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      const result = await service.validateTicket(
        'qr-token',
        '19',
        undefined,
        UserRole.ADMIN,
      );

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

      dataSource.query.mockRejectedValueOnce(
        new Error('audit unavailable'),
      );

      jest.spyOn(service['logger'], 'error').mockImplementation();

      const result = await service.validateTicket(
        'qr-token',
        '19',
        undefined,
        UserRole.ADMIN,
      );

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
            return [
              { ...validationTicket, ticket_status: status },
            ];
          }

          if (sql.startsWith('UPDATE')) {
            if (status !== 'ISSUED') return [];

            status = 'USED';

            return [
              {
                ticket_id: '5',
                event_id: '7',
                checked_in_at: new Date(
                  '2026-01-01T00:00:00.000Z',
                ),
              },
            ];
          }

          throw new Error(`Unexpected query: ${sql}`);
        }),
      };

      dataSource.transaction.mockImplementation(
        (
          callback: (
            transactionManager: typeof transactionalManager,
          ) => unknown,
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
        service.validateTicket('qr-token', '19', undefined, UserRole.ADMIN),
        service.validateTicket('qr-token', '20', undefined, UserRole.ADMIN),
      ]);

      expect(
        results.filter((result) => result.accepted),
      ).toHaveLength(1);

      expect(
        results.find((result) => !result.accepted)?.reason,
      ).toBe(TicketValidationReason.ALREADY_USED);

      expect(
        transactionalManager.query.mock.calls
          .filter(([sql]) => sql.startsWith('SELECT'))
          .every(([sql]) =>
            sql.includes('FOR UPDATE OF t, e'),
          ),
      ).toBe(true);

      expect(dataSource.query).toHaveBeenCalledTimes(2);
    });
  });
});
