import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmPaymentDto {
  @ApiPropertyOptional({
    description: 'External gateway or banking transaction reference to attach upon confirmation',
    example: 'tx_conf_9876543210',
  })
  @IsOptional()
  @IsString()
  transactionReference?: string;
}
