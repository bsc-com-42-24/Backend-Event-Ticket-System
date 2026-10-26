import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersScheduler } from './orders.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Order, TicketType])],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersScheduler],
  exports: [OrdersService],
})
export class OrdersModule {}
