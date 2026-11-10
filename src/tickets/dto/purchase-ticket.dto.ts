import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString, IsOptional, Matches } from 'class-validator';

export class PurchaseTicketDto {
  @ApiProperty({ example: '12' })
  @IsNumberString()
  eventId: string;

  @ApiProperty({ example: '3' })
  @IsNumberString()
  ticketTypeId: string;

  @ApiPropertyOptional({
    example: 'TM-LX1Y2Z3-ABCD1234',
    description:
      'PayChangu tx_ref of the successful payment for this ticket. Required unless PURCHASE_REQUIRES_PAYMENT=false.',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{8,64}$/, {
    message: 'txRef is not a valid payment reference',
  })
  txRef?: string;
}
