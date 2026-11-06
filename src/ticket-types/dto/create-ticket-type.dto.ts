import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateTicketTypeDto {
  @ApiProperty({ example: 'Early Bird' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Limited early access tickets.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 25.5, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 'MWK', minLength: 3, maxLength: 3 })
  @Trim()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  currency: string;

  @ApiProperty({ example: 100, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity: number;

  @ApiPropertyOptional({ example: 4, minimum: 1, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  perOrderLimit?: number;

  @ApiPropertyOptional({ example: '2026-11-01T08:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  salesStartAt?: Date;

  @ApiPropertyOptional({ example: '2026-11-15T18:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  salesEndAt?: Date;
}
