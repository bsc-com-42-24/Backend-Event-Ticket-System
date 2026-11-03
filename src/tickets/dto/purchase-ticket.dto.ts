import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class PurchaseTicketDto {
  @ApiProperty({ example: '12' })
  @IsNumberString()
  eventId: string;

  @ApiProperty({ example: '3' })
  @IsNumberString()
  ticketTypeId: string;
}