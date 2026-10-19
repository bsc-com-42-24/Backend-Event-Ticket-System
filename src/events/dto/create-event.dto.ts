import { Transform, Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// FR-EVENT-02: title, description, venue/location, dates and capacity are required
export class CreateEventDto {
  @Trim() @IsString() @IsNotEmpty() @MaxLength(200)
  title: string;

  @Trim() @IsString() @IsNotEmpty() @MaxLength(5000)
  description: string;

  @Trim() @IsString() @IsNotEmpty() @MaxLength(150)
  venue: string;

  @Trim() @IsString() @IsNotEmpty() @MaxLength(255)
  location: string;

  @Type(() => Date) @IsDate()
  startAt: Date;

  @Type(() => Date) @IsDate()
  endAt: Date;

  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000)
  capacity: number;
}
