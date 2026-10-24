import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TicketValidationReason } from '../enums/ticket-validation-reason.enum';
export { TicketValidationReason } from '../enums/ticket-validation-reason.enum';

export class ValidateTicketDto {
  @ApiPropertyOptional({
    description: 'The secret UUID encoded in the ticket QR code.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  qrToken?: string;

  @ApiPropertyOptional({
    description:
      'Ticket number for manual entry when the QR code cannot be scanned.',
    example: 'TKT-7F3A92C14B',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ticketNumber?: string;

  @ApiPropertyOptional({
    description:
      'Event being checked in, used to reject tickets for another event.',
    example: '42',
  })
  @IsOptional()
  @IsNumberString()
  @MaxLength(30)
  eventId?: string;
}

export class ValidateTicketImageDto {
  @ApiPropertyOptional({
    description: 'Optional event ID to ensure the ticket belongs to this event.',
    example: '42',
  })
  @IsOptional()
  @IsNumberString()
  @MaxLength(30)
  eventId?: string;
}

export class ValidatedTicketDetailsDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ticketNumber: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ type: Date, nullable: true })
  checkedInAt: Date | null;

  @ApiProperty()
  ticketType: string;

  @ApiProperty()
  ownerName: string;
}

export class ValidatedEventDetailsDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  venue: string | null;

  @ApiProperty({ nullable: true })
  location: string | null;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

  @ApiProperty()
  status: string;
}

export class TicketValidationResponseDto {
  @ApiProperty({ description: 'Whether the ticket was accepted for entry.' })
  accepted: boolean;

  @ApiProperty({
    description: 'Short instruction suitable for showing to check-in staff.',
    example: 'Ticket accepted. Admit guest.',
  })
  message: string;

  @ApiProperty({
    enum: TicketValidationReason,
    nullable: true,
    description: 'Rejection reason, or null for an accepted ticket.',
  })
  reason: TicketValidationReason | null;

  @ApiProperty({ type: String, nullable: true })
  ticketId: string | null;

  @ApiProperty({ type: String, nullable: true })
  eventId: string | null;

  @ApiProperty({ type: Date, nullable: true })
  validatedAt: Date | null;

  @ApiProperty({ type: () => ValidatedTicketDetailsDto, nullable: true })
  ticket: ValidatedTicketDetailsDto | null;

  @ApiProperty({ type: () => ValidatedEventDetailsDto, nullable: true })
  event: ValidatedEventDetailsDto | null;
}
