import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { EventStatus } from '../enums/event-status.enum';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({
    enum: EventStatus,
    description: 'Change the event status',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}