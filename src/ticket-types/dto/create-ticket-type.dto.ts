import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTicketTypeDto {
  @ApiProperty({
    description: 'Unique identifier of the parent event',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({
    description: 'Name of the ticket category (e.g. VIP, Early Bird, General Admission)',
    example: 'VIP Access',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({
    description: 'Unit price for this ticket type',
    example: 149.99,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Total number of tickets available for this category',
    example: 200,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalQuantity: number;
}
