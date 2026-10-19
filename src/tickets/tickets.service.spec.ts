import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { QrCodeService } from './qr-code/qr-code.service';
import { TicketsService } from './tickets.service';

describe('TicketsService', () => {
  let service: TicketsService;
  const repo = { findOne: jest.fn(), find: jest.fn() };
  const qr = { generateQrCode: jest.fn().mockResolvedValue('data:image/png;base64,x') };
  const owner = { userId: '5', email: 'a@b.com', role: 'ATTENDEE' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
        { provide: QrCodeService, useValue: qr },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(TicketsService);
  });

  it('hides a ticket from someone who does not own it', async () => {
    repo.findOne.mockResolvedValue({ ownerId: '9', qrToken: 't' });
    await expect(service.getTicket('TKT-1', owner)).rejects.toThrow(NotFoundException);
  });

  it('encodes the qr_token, not the ticket number', async () => {
    repo.findOne.mockResolvedValue({ ownerId: '5', ticketNumber: 'TKT-1', qrToken: 'secret-uuid' });
    const result = await service.getTicketWithQrCode('TKT-1', owner);
    expect(qr.generateQrCode).toHaveBeenCalledWith('secret-uuid');
    expect(result.qrCode).toContain('data:image/png');
  });
});