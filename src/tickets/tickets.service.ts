import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { QrCodeService } from './qr-code/qr-code.service';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly qrCodeService: QrCodeService,
  ) {}

  /** Retrieving with identifier. */
  async getTicket(ticketIdentifier: string): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { ticketIdentifier },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  /** Retrieve a ticket together with its QR code. */
  async getTicketWithQrCode(ticketIdentifier: string) {
    const ticket = await this.getTicket(ticketIdentifier);
    const qrCode = await this.qrCodeService.generateQrCode(ticketIdentifier);
    return { ticket, qrCode };
  }
}
