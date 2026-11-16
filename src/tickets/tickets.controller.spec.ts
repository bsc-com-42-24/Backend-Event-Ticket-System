import { BadRequestException } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  const service = {
    generateTickets: jest.fn(),
    findByEvent: jest.fn(),
    validateTicket: jest.fn(),
    validateTicketImage: jest.fn(),
    purchaseTicket: jest.fn(),
    getCustomerBuyingHistory: jest.fn(),
    getTicket: jest.fn(),
    getTicketWithQrCode: jest.fn(),
    getCheckInSummary: jest.fn(),
  };
  let controller: TicketsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TicketsController(service as unknown as TicketsService);
  });

  it('passes the signed-in customer ID and quantity to ticket claim', async () => {
    service.purchaseTicket.mockResolvedValue({ quantity: 2 });
    const user = { userId: '5' } as any;

    await expect(
      controller.purchaseTicket(
        { eventId: '7', ticketTypeId: '3', quantity: 2 },
        user,
      ),
    ).resolves.toEqual({ quantity: 2 });
    expect(service.purchaseTicket).toHaveBeenCalledWith(
      '5',
      '7',
      '3',
      2,
      undefined,
    );
  });

  it('defaults the ticket quantity to one', () => {
    controller.purchaseTicket(
      { eventId: '7', ticketTypeId: '3' },
      { userId: '5' } as any,
    );
    expect(service.purchaseTicket).toHaveBeenCalledWith(
      '5',
      '7',
      '3',
      1,
      undefined,
    );
  });

  it('passes QR payload and validator identity to ticket validation', () => {
    const input = { qrToken: '{"ticketId":"5","token":"secret"}' };
    const user = { userId: '19', role: 'CHECK_IN_STAFF' } as any;

    controller.validateTicket(input, user);
    expect(service.validateTicket).toHaveBeenCalledWith(
      input.qrToken,
      '19',
      undefined,
      undefined,
      'CHECK_IN_STAFF',
    );
  });

  it('rejects QR image validation when no file was uploaded', () => {
    expect(() =>
      controller.validateTicketImage(undefined, {}, {
        userId: '19',
        role: 'CHECK_IN_STAFF',
      } as any),
    ).toThrow(BadRequestException);
  });
});
