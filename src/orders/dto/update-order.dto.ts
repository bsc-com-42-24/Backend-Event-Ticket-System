import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../entities/order.entity';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    description: 'Updated administrative status of the order',
    enum: OrderStatus,
    example: OrderStatus.CANCELLED,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
