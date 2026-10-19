import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';

import { TicketPurchasesService } from './ticket-purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('ticket-purchases')
@UseGuards(JwtAuthGuard)
export class TicketPurchasesController {
  constructor(
    private readonly ticketPurchasesService: TicketPurchasesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async purchaseTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.ticketPurchasesService.purchaseTickets(user.userId, dto);
  }
}