import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event, EventStatus } from './entities/event.entity';

@ApiTags('Events Management')
@Controller('management/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({
    status: 201,
    description: 'Event created successfully.',
    type: Event,
  })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  create(@Body() dto: CreateEventDto): Promise<Event> {
    return this.eventsService.createEvent(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all events with optional status filter' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: EventStatus,
    description: 'Filter events by their status',
  })
  @ApiResponse({
    status: 200,
    description: 'Retrieved list of events.',
    type: [Event],
  })
  findAll(@Query('status') status?: EventStatus): Promise<Event[]> {
    return this.eventsService.findAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single event by ID' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Event details retrieved.',
    type: Event,
  })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Event> {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing event' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiBody({ type: UpdateEventDto })
  @ApiResponse({
    status: 200,
    description: 'Event updated successfully.',
    type: Event,
  })
  @ApiResponse({ status: 400, description: 'Invalid data or completed event.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<Event> {
    return this.eventsService.updateEvent(id, dto);
  }

  @Patch(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish an event to make it active' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Event published successfully.',
    type: Event,
  })
  @ApiResponse({ status: 400, description: 'Event cannot be published.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  publish(@Param('id', ParseUUIDPipe) id: string): Promise<Event> {
    return this.eventsService.publishEvent(id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an event' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Event cancelled successfully.',
    type: Event,
  })
  @ApiResponse({ status: 400, description: 'Event cannot be cancelled.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<Event> {
    return this.eventsService.cancelEvent(id);
  }
}
