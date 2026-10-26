import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { FilterOrdersDto } from './dto/filter-orders.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';

@ApiTags('Orders Management')
@Controller('management/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Reserve/create a new order (Simulation/Testing endpoint)',
    description:
      'Creates a pending ticket reservation with expiration timer and decrements remaining inventory.',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({
    status: 201,
    description: 'Order created in PENDING state.',
    type: Order,
  })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid input.' })
  @ApiResponse({ status: 404, description: 'Ticket type not found.' })
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.createOrder(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List orders with optional filtering by status, event, or customer',
  })
  @ApiResponse({
    status: 200,
    description: 'List of matching orders with relational data.',
    type: [Order],
  })
  findAll(@Query() filter: FilterOrdersDto): Promise<Order[]> {
    return this.ordersService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed order information by ID' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order details retrieved successfully.',
    type: Order,
  })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-expire an unpaid pending order',
    description:
      'Administrative action to immediately expire a pending order and replenish ticket stock.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order successfully force-expired.',
    type: Order,
  })
  @ApiResponse({
    status: 400,
    description: 'Order is not in PENDING state.',
  })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  forceExpire(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.forceExpire(id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an order',
    description:
      'Cancels an active or pending order and returns reserved tickets to available inventory.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully.',
    type: Order,
  })
  @ApiResponse({
    status: 400,
    description: 'Order is already cancelled or expired.',
  })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.cancelOrder(id);
  }
}
