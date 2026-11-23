import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedOrganizerGuard } from '../auth/guards/verified-organizer.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user-role.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto, QueryMyEventsDto } from './dto/query-events.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { EventsService } from './events.service';
import { NumericIdPipe } from './pipes/numeric-id.pipe';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import type { AuthUser } from './types/auth-user.type';

const ManagerOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard, VerifiedOrganizerGuard),
    Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN),
    ApiBearerAuth(),
  );

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ManagerOnly()
  @ApiOperation({ summary: 'Create an event (starts as DRAFT)' })
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthUser) {
    return this.events.create(dto, user);
  }

  // must stay above @Get(':id')
  @Get('mine')
  @ManagerOnly()
  @ApiOperation({ summary: 'List events I manage (all statuses)' })
  findMine(@Query() q: QueryMyEventsDto, @CurrentUser() user: AuthUser) {
    return this.events.findMine(q, user);
  }

  @Get()
  @ApiOperation({ summary: 'Browse published events (public)' })
  findAll(@Query() q: QueryEventsDto) {
    return this.events.findPublished(q);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get event details (drafts are visible to the owner/admin only)',
  })
  findOne(@Param('id', NumericIdPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.events.findOne(id, user);
  }

  @Patch(':id')
  @ManagerOnly()
  @ApiOperation({ summary: 'Update an event (owner/admin)' })
  update(
    @Param('id', NumericIdPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.update(id, dto, user);
  }

  @Patch(':id/status')
  @ManagerOnly()
  @ApiOperation({
    summary: 'Change event status (e.g., restore CANCELLED -> DRAFT or PUBLISHED)',
  })
  updateStatus(
    @Param('id', NumericIdPipe) id: string,
    @Body() dto: UpdateEventStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.updateStatus(id, dto.status, user);
  }
}
