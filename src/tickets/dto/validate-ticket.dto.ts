import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TicketValidationReason } from '../enums/ticket-validation-reason.enum';
export { TicketValidationReason } from '../enums/ticket-validation-reason.enum';

export class ValidateTicketDto {
  @ApiPropertyOptional({
    description:
      'QR text containing the ticket ID and its secret token. Use instead of ticketNumber.',
    example:
      '{"ticketId":"123","token":"7a3d3bb5-cf46-4c52-8acf-389ccadf440a"}',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  qrToken?: string;

  @ApiPropertyOptional({
    description: 'Manual ticket number. Use instead of qrToken.',
    example: 'TKT-7F3A92C14B',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ticketNumber?: string;

  @ApiPropertyOptional({
    description: 'Event being checked in; rejects tickets for a different event.',
    example: '42',
  })
  @IsOptional()
  @IsNumberString()
  @MaxLength(18)
  @Matches(/^[1-9]\d{0,17}$/)
  eventId?: string;
}

export class ValidateTicketImageDto {
  @ApiPropertyOptional({
    description: 'Optional event ID to ensure the ticket belongs to this event.',
    example: '42',
  })
  @IsOptional()
  @IsNumberString()
  @MaxLength(18)
  @Matches(/^[1-9]\d{0,17}$/)
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

  @ApiProperty({ nullable: true })
  ownerName: string | null;
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
