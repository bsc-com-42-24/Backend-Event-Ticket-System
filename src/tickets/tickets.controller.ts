import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { NumericIdPipe } from '../events/pipes/numeric-id.pipe';
import { UserRole } from '../users/user-role.enum';
import {
  TicketValidationResponseDto,
  ValidateTicketDto,
} from './dto/validate-ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // static routes stay above ':ticketNumber'

  @Post('events/:eventId/generate')
  @HttpCode(200)
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Generate the tickets for an event from its capacity and ticket types',
  })
  @ApiOkResponse({
    description:
      'Tickets created. Calling it again only creates tickets that are still missing.',
  })
  @ApiBadRequestResponse({ description: 'The event ID is invalid.' })
  @ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
  @ApiForbiddenResponse({
    description: 'Only organizers and administrators may generate tickets.',
  })
  @ApiNotFoundResponse({
    description: 'The event does not exist or belongs to another organizer.',
  })
  @ApiConflictResponse({
    description:
      'The event is cancelled/completed, has no active ticket types, or would exceed its capacity.',
  })
  generateTickets(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.generateTickets(eventId, user);
  }

  @Get('events/:eventId')
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List all tickets generated for an event' })
  @ApiNotFoundResponse({
    description: 'The event does not exist or belongs to another organizer.',
  })
  findByEvent(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findByEvent(eventId, user);
  }

  @Post('validate')
  @HttpCode(200)
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
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get one ticket of one of my events' })
  @ApiNotFoundResponse({ description: 'Ticket not found.' })
  getTicket(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicket(ticketNumber, user);
  }

  @Get(':ticketNumber/qr')
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a ticket with its QR code (PNG data URL)' })
  @ApiNotFoundResponse({ description: 'Ticket not found.' })
  getTicketQrCode(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicketWithQrCode(ticketNumber, user);
  }
}