import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NumericIdPipe } from '../events/pipes/numeric-id.pipe';
import { UserRole } from '../users/user-role.enum';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { TicketTypesService } from './ticket-types.service';

const ManagerOrAdmin = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN),
    ApiBearerAuth(),
  );

@ApiTags('Ticket Types & Monitoring')
@Controller('events/:eventId')
export class TicketTypesController {
  constructor(private readonly ticketTypes: TicketTypesService) {}

  @Get('ticket-types')
  @ApiOperation({ summary: 'List active ticket types and prices for a published event' })
  @ApiParam({ name: 'eventId', example: '12' })
  list(@Param('eventId', NumericIdPipe) eventId: string) {
    return this.ticketTypes.findPublic(eventId);
  }

  @Post('ticket-types')
  @ManagerOrAdmin()
  @ApiOperation({ summary: 'Create a ticket type for an event owned by the manager' })
  @ApiParam({ name: 'eventId', example: '12' })
  create(
    @Param('eventId', NumericIdPipe) eventId: string,
    @Body() dto: CreateTicketTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketTypes.create(eventId, dto, user);
  }

  @Patch('ticket-types/:ticketTypeId')
  @ManagerOrAdmin()
  @ApiOperation({ summary: 'Edit a ticket type without lowering stock below sold or reserved' })
  @ApiParam({ name: 'eventId', example: '12' })
  @ApiParam({ name: 'ticketTypeId', example: '3' })
  update(
    @Param('eventId', NumericIdPipe) eventId: string,
    @Param('ticketTypeId', NumericIdPipe) ticketTypeId: string,
    @Body() dto: UpdateTicketTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketTypes.update(eventId, ticketTypeId, dto, user);
  }

  @Post('ticket-types/:ticketTypeId/deactivate')
  @ManagerOrAdmin()
  @ApiOperation({ summary: 'Deactivate a ticket type without deleting its history' })
  @ApiParam({ name: 'eventId', example: '12' })
  @ApiParam({ name: 'ticketTypeId', example: '3' })
  deactivate(
    @Param('eventId', NumericIdPipe) eventId: string,
    @Param('ticketTypeId', NumericIdPipe) ticketTypeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketTypes.deactivate(eventId, ticketTypeId, user);
  }

  @Get('sales-summary')
  @ManagerOrAdmin()
  @ApiOperation({ summary: 'Get sold, reserved, remaining inventory and PAID-order revenue' })
  @ApiParam({ name: 'eventId', example: '12' })
  salesSummary(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketTypes.getSalesSummary(eventId, user);
  }

  @Get('attendance-summary')
  @ManagerOrAdmin()
  @ApiOperation({ summary: 'Get issued, checked-in and not-checked-in ticket counts' })
  @ApiParam({ name: 'eventId', example: '12' })
  attendanceSummary(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketTypes.getAttendanceSummary(eventId, user);
  }
}
