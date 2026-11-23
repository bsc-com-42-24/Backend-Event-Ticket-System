import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EventStatus } from '../enums/event-status.enum';

export class UpdateEventStatusDto {
  @ApiProperty({
    enum: EventStatus,
    example: EventStatus.DRAFT,
    description: 'Target status (e.g., restore CANCELLED -> DRAFT or PUBLISHED)',
  })
  @IsEnum(EventStatus)
  status: EventStatus;
}
