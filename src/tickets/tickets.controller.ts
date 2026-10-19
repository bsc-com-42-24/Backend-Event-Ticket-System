import {Controller,Get,Param,} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
 constructor(
 private readonly ticketsService: TicketsService,
 ) {}
 /**
 * GET /tickets/:ticketIdentifier
 */
        @Get(':ticketIdentifier')
         @ApiOperation({ summary: 'Retrieve a ticket by its identifier' })
        @ApiParam({
            name: 'ticketIdentifier',
            description: 'Unique identifier of the ticket',
 })
 @ApiResponse({ status: 200, description: 'Ticket retrieved successfully' })
 @ApiResponse({ status: 404, description: 'Ticket not found' })
        async getTicket(
 @Param('ticketIdentifier') ticketIdentifier: string,
 ) {
 return this.ticketsService.getTicket(ticketIdentifier);
 }
 /**
 * GET /tickets/:ticketIdentifier/qr
 */
 @Get(':ticketIdentifier/qr')
 @ApiOperation({ summary: 'Generate a QR code for a ticket' })
 @ApiParam({
     name: 'ticketIdentifier',
    description: 'Unique identifier of the ticket',
 })
 @ApiResponse({ status: 200, description: 'QR code generated successfully' })
 @ApiResponse({ status: 404, description: 'Ticket not found' })
 async getTicketQrCode(
 @Param('ticketIdentifier') ticketIdentifier: string,
 ) {
 return this.ticketsService.getTicketWithQrCode(ticketIdentifier);
 }
}