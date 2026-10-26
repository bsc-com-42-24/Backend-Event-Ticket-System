import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../entities/payment.entity';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'UUID of the order associated with this payment',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    description: 'Amount paid for the order',
    example: 299.98,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Payment method utilized',
    enum: PaymentMethod,
    example: PaymentMethod.CARD,
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    description: 'External payment processor transaction identifier or receipt reference',
    example: 'ch_3MtwxAE2eZvKYlo21vCsh20X',
  })
  @IsOptional()
  @IsString()
  transactionReference?: string;
}
