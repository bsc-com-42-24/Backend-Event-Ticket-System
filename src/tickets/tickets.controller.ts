import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // static routes stay above ':ticketNumber'
  @Get('mine')
  @ApiOperation({ summary: 'List my tickets' })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.findMine(user);
  }

  @Post('orders/:orderId/pay')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Temporary: mark an order PAID and issue its tickets (admin)' })
  payOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.ticketsService.payOrder(orderId);
  }

  @Get(':ticketNumber')
  @ApiOperation({ summary: 'Get one of my tickets' })
  getTicket(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicket(ticketNumber, user);
  }

  @Get(':ticketNumber/qr')
  @ApiOperation({ summary: 'Get my ticket with its QR code (PNG data URL)' })
  getTicketQrCode(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicketWithQrCode(ticketNumber, user);
  }
}