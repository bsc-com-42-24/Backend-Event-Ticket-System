import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EventStatus } from '../entities/event.entity';

export class UpdateEventDto {
  @ApiPropertyOptional({
    description: 'Title of the event',
    example: 'Global Tech Summit 2026 - Keynote',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the event',
    example: 'Updated gathering schedule of tech leaders.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Scheduled date and time of the event (ISO 8601)',
    example: '2026-11-16T10:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({
    description: 'Physical or virtual venue location',
    example: 'Metropolitan Center, Main Auditorium',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  venue?: string;

  @ApiPropertyOptional({
    description: 'Total seating or entry capacity for the event',
    example: 1200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalCapacity?: number;

  @ApiPropertyOptional({
    description: 'Publication status of the event',
    enum: EventStatus,
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
