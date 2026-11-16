import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PurchaseTicketDto {
  @ApiProperty({ example: '12' })
  @IsNumberString()
  @MaxLength(18)
  @Matches(/^[1-9]\d{0,17}$/)
  eventId: string;

  @ApiProperty({ example: '3' })
  @IsNumberString()
  @MaxLength(18)
  @Matches(/^[1-9]\d{0,17}$/)
  ticketTypeId: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 10, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;

  @ApiPropertyOptional({
    example: 'TM-LX1Y2Z3-ABCD1234',
    description:
      'PayChangu tx_ref for paid tickets when payment is required by server configuration.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9-]{8,64}$/, {
    message: 'txRef is not a valid payment reference',
  })
  txRef?: string;
}
