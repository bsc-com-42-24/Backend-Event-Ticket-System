import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class PurchaseTicketDto {
  @ApiProperty({ example: '1', description: 'The event to buy a ticket for.' })
  @IsNumberString()
  eventId: string;

  @ApiProperty({
    example: '1',
    description: 'The ticket type (e.g. VIP, Regular) of that event.',
  })
  @IsNumberString()
  ticketTypeId: string;
}