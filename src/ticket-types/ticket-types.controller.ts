import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TicketTypesService } from './ticket-types.service';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { TicketType } from './entities/ticket-type.entity';

@ApiTags('Ticket Types Management')
@Controller('management/ticket-types')
export class TicketTypesController {
  constructor(private readonly ticketTypesService: TicketTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ticket type for an event' })
  @ApiResponse({
    status: 201,
    description: 'Ticket type created successfully.',
    type: TicketType,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or exceeds event capacity.',
  })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  create(@Body() dto: CreateTicketTypeDto): Promise<TicketType> {
    return this.ticketTypesService.create(dto);
  }

  @Get('event/:eventId')
  @ApiOperation({ summary: 'Get all ticket types configured for a specific event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of ticket types for the event.',
    type: [TicketType],
  })
  findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<TicketType[]> {
    return this.ticketTypesService.findByEvent(eventId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific ticket type by ID' })
  @ApiParam({ name: 'id', description: 'TicketType UUID' })
  @ApiResponse({
    status: 200,
    description: 'Ticket type retrieved.',
    type: TicketType,
  })
  @ApiResponse({ status: 404, description: 'Ticket type not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TicketType> {
    return this.ticketTypesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing ticket type' })
  @ApiParam({ name: 'id', description: 'TicketType UUID' })
  @ApiBody({ type: UpdateTicketTypeDto })
  @ApiResponse({
    status: 200,
    description: 'Ticket type updated successfully.',
    type: TicketType,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data or capacity conflict.',
  })
  @ApiResponse({ status: 404, description: 'Ticket type not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketTypeDto,
  ): Promise<TicketType> {
    return this.ticketTypesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ticket type' })
  @ApiParam({ name: 'id', description: 'TicketType UUID' })
  @ApiResponse({
    status: 204,
    description: 'Ticket type removed successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete ticket type with existing orders.',
  })
  @ApiResponse({ status: 404, description: 'Ticket type not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.ticketTypesService.remove(id);
  }
}
