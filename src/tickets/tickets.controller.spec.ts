import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  let controller: TicketsController;
  const service = {
    findMine: jest.fn().mockResolvedValue([]),
    validateTicket: jest.fn(),
    validateTicketImage: jest.fn(),
    getCheckInSummary: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(TicketsController);
  });

  it('lists my tickets', async () => {
    const user = { userId: '5' } as any;
    await controller.findMine(user);
    expect(service.findMine).toHaveBeenCalledWith(user);
  });

  it('passes a manually entered code and manager identity to validation', () => {
    const user = { userId: '19', role: 'ORGANIZER' } as any;
    const input = { ticketNumber: 'TKT-7F3A92C14B', eventId: '7' };

    controller.validateTicket(input, user);

    expect(service.validateTicket).toHaveBeenCalledWith(
      undefined,
      '19',
      '7',
      'TKT-7F3A92C14B',
      'ORGANIZER',
    );
  });

  it('passes the uploaded image, event, and validator to validation', () => {
    const user = { userId: '19', role: 'CHECK_IN_STAFF' } as any;
    const file = { buffer: Buffer.from('image bytes') };
    const input = { eventId: '7' };

    controller.validateTicketImage(file, input, user);

    expect(service.validateTicketImage).toHaveBeenCalledWith(
      file.buffer,
      '19',
      '7',
      'CHECK_IN_STAFF',
    );
  });

  it('rejects image validation when no file was uploaded', () => {
    expect(() =>
      controller.validateTicketImage(undefined, {}, {
        userId: '19',
        role: 'CHECK_IN_STAFF',
      } as any),
    ).toThrow(BadRequestException);
  });
});