import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
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
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import {
  TicketValidationResponseDto,
  ValidateTicketDto,
  ValidateTicketImageDto,
} from './dto/validate-ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('purchase')
  @HttpCode(201)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Claim free tickets; paid checkout is not yet available',
  })
  @ApiBadRequestResponse({ description: 'The ticket quantity is invalid.' })
  @ApiConflictResponse({
    description:
      'Sales are closed, the type is sold out, the per-order limit is exceeded, or paid checkout is unavailable.',
  })
  @ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
  @ApiForbiddenResponse({
    description: 'Only customers and administrators may claim tickets.',
  })
  @ApiNotFoundResponse({ description: 'The ticket type is unavailable.' })
  purchaseTicket(
    @Body() body: PurchaseTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.purchaseTicket(
      user.userId,
      body.eventId,
      body.ticketTypeId,
      body.quantity ?? 1,
    );
  }

  @Get('history')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: "List the current customer's tickets and QR codes" })
  getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.getCustomerBuyingHistory(user.userId);
  }

  @Post('events/:eventId/generate')
  @HttpCode(200)
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: "Generate tickets from an event's active ticket type limits",
  })
  @ApiOkResponse({
    description:
      'Creates only missing tickets; repeating the request does not create duplicates.',
  })
  @ApiConflictResponse({
    description: 'The event is closed, no types are active, or capacity is exceeded.',
  })
  generateTickets(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.generateTickets(eventId, user);
  }

  @Get('events/:eventId')
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List tickets for an event you manage' })
  findByEvent(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findByEvent(eventId, user);
  }

  @Post('validate')
  @HttpCode(200)
  @Roles(UserRole.VALIDATOR, UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Validate a QR payload or manually entered ticket number',
  })
  @ApiOkResponse({
    description:
      'Returns an acceptance decision, reason, ticket details, and event details.',
    type: TicketValidationResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Provide exactly one valid qrToken or ticketNumber and an optional eventId.',
  })
  validateTicket(
    @Body() input: ValidateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.validateTicket(
      input.qrToken,
      user.userId,
      input.eventId,
      input.ticketNumber,
      user.role,
    );
  }

  @Post('validate/image')
  @HttpCode(200)
  @Roles(UserRole.VALIDATOR, UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        eventId: { type: 'string', example: '42' },
      },
    },
  })
  @ApiOperation({ summary: 'Validate a ticket by uploading its QR image' })
  validateTicketImage(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() input: ValidateTicketImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload a QR image using the "file" field.');
    }

    return this.ticketsService.validateTicketImage(
      file.buffer,
      user.userId,
      input.eventId,
      user.role,
    );
  }

  @Get('events/:eventId/check-in-summary')
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'View check-in progress for an event you manage' })
  getCheckInSummary(
    @Param('eventId', NumericIdPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getCheckInSummary(eventId, user);
  }

  @Get(':ticketNumber/qr')
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a ticket and QR code for your event' })
  getTicketQrCode(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicketWithQrCode(ticketNumber, user);
  }

  @Get(':ticketNumber')
  @Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get one ticket from an event you manage' })
  getTicket(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicket(ticketNumber, user);
  }
}
