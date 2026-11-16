import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user-role.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto, QueryMyEventsDto } from './dto/query-events.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import { NumericIdPipe } from './pipes/numeric-id.pipe';
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
  @ApiOperation({
    summary: 'Create an event and ticket types (DRAFT by default)',
  })
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
  @ApiOperation({
    summary: 'Browse published events (public)',
    description:
      'Search upcoming published events by keyword, location, date range, and ticket availability.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Case-insensitive keyword matched against the event title, description, venue, and location.',
    example: 'product launch',
  })
  @ApiQuery({
    name: 'location',
    required: false,
    description: 'Case-insensitive partial match against location or venue.',
    example: 'Blantyre',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Only include events starting on or after this date/time.',
    example: '2027-03-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Only include events starting on or before this date/time.',
    example: '2027-03-31T23:59:59.000Z',
  })
  @ApiQuery({
    name: 'availableOnly',
    required: false,
    type: Boolean,
    description: 'When true, only include events with ticket stock remaining.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Results per page (maximum 50).',
    example: 10,
  })
  findAll(@Query() q: QueryEventsDto) {
    return this.events.findPublished(q);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'View event details; use the availability route for ticket stock',
  })
  findOne(
    @Param('id', NumericIdPipe) id: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.events.findOne(id, user);
  }

  @Patch(':id')
  @ManagerOnly()
  @ApiOperation({
    summary: 'Update an event or publish a draft',
  })
  update(
    @Param('id', NumericIdPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(200)
  @ManagerOnly()
  @ApiOperation({ summary: 'Cancel an event (status -> CANCELLED)' })
  cancel(@Param('id', NumericIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.events.cancel(id, user);
  }
}
