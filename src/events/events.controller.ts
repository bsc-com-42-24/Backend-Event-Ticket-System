import {
  applyDecorators, Body, Controller, Delete, Get, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';           // Member 2
import { RolesGuard } from '../auth/guards/roles.guard';                // Member 2
import { Roles } from '../auth/decorators/roles.decorator';            // Member 2
import { CurrentUser } from '../auth/decorators/current-user.decorator'; // Member 2
import { UserRole } from '../users/user-role.enum';                        // Member 2
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto, QueryMyEventsDto } from './dto/query-events.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import type { AuthUser } from './types/auth-user.type';

const ManagerOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
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
  @ApiOperation({ summary: 'View event details incl. remaining tickets' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.events.findOne(id, user);
  }

  @Patch(':id')
  @ManagerOnly()
  @ApiOperation({ summary: 'Update an event (owner/admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.update(id, dto, user);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ManagerOnly()
  @ApiOperation({ summary: 'Publish a DRAFT event' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.events.publish(id, user);
  }

  @Delete(':id')
  @HttpCode(200)
  @ManagerOnly()
  @ApiOperation({ summary: 'Cancel an event (status -> CANCELLED)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.events.cancel(id, user);
  }
}
