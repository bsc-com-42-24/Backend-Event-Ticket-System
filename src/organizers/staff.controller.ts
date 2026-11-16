import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VALIDATOR, UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@ApiForbiddenResponse({ description: 'Only check-in staff may access assigned events.' })
export class StaffController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('me/events')
  @ApiOperation({ summary: 'Fetch events assigned to the logged-in scanner/staff member' })
  @ApiOkResponse({ description: 'List of assigned events.' })
  async getMyAssignedEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.dataSource.query(
      `SELECT e.event_id AS "eventId", e.title, e.description, e.venue, e.location,
              e.start_at AS "startAt", e.end_at AS "endAt", e.status,
              e.capacity, e.tickets_issued AS "ticketsIssued"
       FROM staff_event_assignments sea
       JOIN events e ON e.event_id = sea.event_id
       WHERE sea.staff_id = $1
       ORDER BY e.start_at ASC`,
      [user.userId],
    );
  }
}
