import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { TicketPurchaseService } from './ticket-purchase.service';

@ApiTags('Ticket purchase')
@ApiBearerAuth()
@Controller('tickets/purchase')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketPurchaseController {
  constructor(private readonly purchaseService: TicketPurchaseService) {}

  @Post()
  @HttpCode(201)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Buy a ticket: choose an event and one of its ticket types',
  })
  @ApiBadRequestResponse({ description: 'Invalid ids or sales not open.' })
  @ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
  @ApiForbiddenResponse({
    description: 'Only customers and administrators may buy tickets.',
  })
  @ApiNotFoundResponse({
    description: 'The event or the ticket type for that event was not found.',
  })
  @ApiConflictResponse({
    description: 'Event not published, ticket type sold out, or event full.',
  })
  purchase(
    @Body() body: PurchaseTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseService.purchase(body.eventId, body.ticketTypeId, user);
  }
}