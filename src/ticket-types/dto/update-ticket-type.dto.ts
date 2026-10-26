import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTicketTypeDto {
  @ApiPropertyOptional({
    description: 'Name of the ticket category',
    example: 'VIP Access - Tier 1',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Unit price for this ticket category',
    example: 179.99,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Total number of tickets allocated for this category',
    example: 250,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalQuantity?: number;
}
