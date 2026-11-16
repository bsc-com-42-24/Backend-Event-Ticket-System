import {
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { EventStatus } from '../enums/event-status.enum';

export class UpdateEventDto extends PartialType(
  OmitType(CreateEventDto, ['ticketTypes', 'status'] as const),
) {
  @ApiPropertyOptional({
    enum: [EventStatus.DRAFT, EventStatus.PUBLISHED],
    description: 'Change the event status',
  })
  @IsOptional()
  @IsIn([EventStatus.DRAFT, EventStatus.PUBLISHED])
  status?: EventStatus.DRAFT | EventStatus.PUBLISHED;
}
