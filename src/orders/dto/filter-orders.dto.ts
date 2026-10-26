import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '../entities/order.entity';

export class FilterOrdersDto {
  @ApiPropertyOptional({
    description: 'Filter orders by status',
    enum: OrderStatus,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Filter orders by event UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Filter orders by customer UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter orders by ticket type UUID',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;
}
