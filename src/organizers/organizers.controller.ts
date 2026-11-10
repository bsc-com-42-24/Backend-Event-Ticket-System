import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { AssignStaffEventsDto } from './dto/assign-staff-events.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { SetStaffActiveDto } from './dto/set-staff-active.dto';
import { OrganizersService } from './organizers.service';

@ApiTags('Organizer staff')
@ApiBearerAuth()
@Controller('organizers/me/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EVENT_MANAGER)
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@ApiForbiddenResponse({ description: 'Only organizers may manage staff.' })
export class OrganizersController {
  constructor(private readonly organizersService: OrganizersService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a check-in staff account' })
  @ApiBadRequestResponse({ description: 'Invalid name, email or password.' })
  @ApiConflictResponse({ description: 'Email is already registered.' })
  createStaff(
    @Body() body: CreateStaffDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizersService.createStaff(user.userId, body);
  }

  @Get()
  @ApiOperation({
    summary: 'List the check-in staff I created, with their assigned events',
  })
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.organizersService.listStaff(user.userId);
  }

  @Put(':staffId/events')
  @ApiOperation({
    summary: 'Set the events a staff member may validate tickets for',
    description:
      'Replaces the staff member’s assignments with the given list of your own events.',
  })
  @ApiOkResponse({ description: 'The staff member with the new assignments.' })
  @ApiBadRequestResponse({
    description: 'Invalid ids, or an event is not one of your events.',
  })
  @ApiNotFoundResponse({ description: 'Staff member not found.' })
  assignEvents(
    @Param('staffId', NumericIdPipe) staffId: string,
    @Body() body: AssignStaffEventsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizersService.assignEvents(
      user.userId,
      staffId,
      body.eventIds,
    );
  }

  @Patch(':staffId/active')
  @ApiOperation({ summary: 'Activate or deactivate a staff account' })
  @ApiOkResponse({ description: 'The updated staff member.' })
  @ApiNotFoundResponse({ description: 'Staff member not found.' })
  setActive(
    @Param('staffId', NumericIdPipe) staffId: string,
    @Body() body: SetStaffActiveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizersService.setActive(
      user.userId,
      staffId,
      body.isActive,
    );
  }

  @Delete(':staffId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a staff member',
    description:
      'Deletes their assignments and ownership record and disables the account. ' +
      'Tickets, orders and past validation history are kept.',
  })
  @ApiNoContentResponse({ description: 'Staff member removed.' })
  @ApiNotFoundResponse({ description: 'Staff member not found.' })
  async removeStaff(
    @Param('staffId', NumericIdPipe) staffId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.organizersService.removeStaff(user.userId, staffId);
  }
}
