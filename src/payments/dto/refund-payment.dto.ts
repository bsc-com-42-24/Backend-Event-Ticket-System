import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefundPaymentDto {
  @ApiPropertyOptional({
    description: 'Internal rationale or customer justification for issuing this refund',
    example: 'Event schedule modified; customer requested cancellation.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'External refund transaction reference identifier from payment gateway',
    example: 're_3MtwxAE2eZvKYlo21vCsh20X',
  })
  @IsOptional()
  @IsString()
  transactionReference?: string;
}
