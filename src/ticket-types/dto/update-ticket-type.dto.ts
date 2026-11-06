import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTicketTypeDto } from './create-ticket-type.dto';

export class UpdateTicketTypeDto extends PartialType(CreateTicketTypeDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}