import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EventStatus } from '../entities/event.entity';

export class CreateEventDto {
  @ApiProperty({
    description: 'Title of the event',
    example: 'Global Tech Summit 2026',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Detailed description of the event',
    example: 'Annual gathering of tech leaders and software engineers.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Scheduled date and time of the event (ISO 8601)',
    example: '2026-11-15T09:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  date: Date;

  @ApiProperty({
    description: 'Physical or virtual venue location',
    example: 'Convention Center, Hall A, San Francisco, CA',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  venue: string;

  @ApiProperty({
    description: 'Total seating or entry capacity for the event',
    example: 1000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalCapacity: number;

  @ApiPropertyOptional({
    description: 'Initial publication status of the event',
    enum: EventStatus,
    default: EventStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
