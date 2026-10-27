
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  let controller: TicketsController;

  const service = {
    generateTickets: jest.fn(),
    findByEvent: jest.fn(),
    validateTicket: jest.fn(),
    getTicket: jest.fn(),
    getTicketWithQrCode: jest.fn(),
  };

  const user = {
    userId: '5',
    email: 'organizer@example.com',
    role: 'ORGANIZER',
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        { provide: TicketsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TicketsController);
  });

  it('generates tickets for an event', async () => {
    const result = { eventId: '7', newlyCreated: 5 };
    service.generateTickets.mockResolvedValue(result);

    await expect(
      controller.generateTickets('7', user),
    ).resolves.toEqual(result);

    expect(service.generateTickets).toHaveBeenCalledWith(
      '7',
      user,
    );
  });

  it('lists tickets for an event', async () => {
    const result = [{ ticketNumber: 'TKT-1' }];
    service.findByEvent.mockResolvedValue(result);

    await expect(
      controller.findByEvent('7', user),
    ).resolves.toEqual(result);

    expect(service.findByEvent).toHaveBeenCalledWith(
      '7',
      user,
    );
  });

  it('validates a ticket using the supplied QR token and user ID', async () => {
    const input = {
      qrToken: 'secret-qr-token',
      eventId: '7',
    };
    const result = { accepted: true, reason: null };
    service.validateTicket.mockResolvedValue(result);

    await expect(
      controller.validateTicket(input as any, user),
    ).resolves.toEqual(result);

    expect(service.validateTicket).toHaveBeenCalledWith(
      'secret-qr-token',
      '5',
      '7',
    );
  });

  it('gets a ticket by its ticket number', async () => {
    const result = { ticketNumber: 'TKT-1' };
    service.getTicket.mockResolvedValue(result);

    await expect(
      controller.getTicket('TKT-1', user),
    ).resolves.toEqual(result);

    expect(service.getTicket).toHaveBeenCalledWith(
      'TKT-1',
      user,
    );
  });

  it('gets a ticket with its QR code', async () => {
    const result = {
      ticket: { ticketNumber: 'TKT-1' },
      qrCode: 'data:image/png;base64,x',
    };
    service.getTicketWithQrCode.mockResolvedValue(result);

    await expect(
      controller.getTicketQrCode('TKT-1', user),
    ).resolves.toEqual(result);

    expect(service.getTicketWithQrCode).toHaveBeenCalledWith(
      'TKT-1',
      user,
    );
  });
});
