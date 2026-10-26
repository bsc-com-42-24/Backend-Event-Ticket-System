import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({
    description: 'UUID of the customer placing the order',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({
    description: 'UUID of the ticket type being reserved',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsUUID()
  @IsNotEmpty()
  ticketTypeId: string;

  @ApiProperty({
    description: 'Number of tickets requested in this order',
    example: 2,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
