import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsOptional,
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
  @Max(1000)
  quantity?: number;
}