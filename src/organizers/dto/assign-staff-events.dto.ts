import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, Matches } from 'class-validator';

export class AssignStaffEventsDto {
  @ApiProperty({
    description:
      'The complete list of your events this staff member may check tickets in for. ' +
      'It replaces the previous assignment; send an empty list to remove all assignments.',
    type: [String],
    example: ['42', '43'],
  })
  // Accept numeric ids too ([42]) and normalise them to strings.
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v: unknown) => (typeof v === 'number' ? String(v) : v))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,17}$/, {
    each: true,
    message: 'each eventId must be a positive integer',
  })
  eventIds: string[];
}
