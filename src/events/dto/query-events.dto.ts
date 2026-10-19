import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { EventStatus } from '../enums/event-status.enum';

export class QueryEventsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 10;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsString() @MaxLength(100)
  location?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;

  /** only events that still have tickets left */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  availableOnly?: boolean;
}

export class QueryMyEventsDto extends QueryEventsDto {
  @IsOptional() @IsEnum(EventStatus)
  status?: EventStatus;
}
