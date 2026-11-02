
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreateTicketTypeDto } from '../../ticket-types/dto/create-ticket-type.dto';

const Trim = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class CreateEventDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  venue: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location: string;

  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @Type(() => Date)
  @IsDate()
  endAt: Date;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  capacity: number;

  // Ticket types are now submitted when creating an event.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTicketTypeDto)
  ticketTypes: CreateTicketTypeDto[];
}
