import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import {
  TicketValidationResponseDto,
  ValidateTicketDto,
} from './dto/validate-ticket.dto';
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
  @ApiOperation({
    summary: 'Temporary: mark an order PAID and issue its tickets (admin)',
  })
  payOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.ticketsService.payOrder(orderId);
  }

  @Post('validate')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.VALIDATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Validate a ticket QR token for event entry' })
  @ApiOkResponse({
    description:
      'Returns accepted=true or accepted=false with a specific rejection reason.',
    type: TicketValidationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The QR token or event ID is invalid.',
  })
  @ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
  @ApiForbiddenResponse({
    description: 'Only check-in staff and administrators may validate tickets.',
  })
  validateTicket(
    @Body() input: ValidateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.validateTicket(
      input.qrToken,
      user.userId,
      input.eventId,
    );
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
