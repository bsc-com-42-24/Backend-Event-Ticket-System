import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { TicketPurchasesService } from './ticket-purchases.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';

@Controller('ticket-purchases')
export class TicketPurchasesController {
  constructor(
    private readonly ticketPurchasesService: TicketPurchasesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async purchaseTickets(@Body() dto: CreatePurchaseDto) {
    return this.ticketPurchasesService.purchaseTickets(dto);
  }
}