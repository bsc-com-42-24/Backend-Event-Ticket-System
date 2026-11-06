import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order and reserve tickets' })
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get my orders' })
  getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getMyOrders(user);
  }

  @Get(':orderNumber')
  @ApiOperation({ summary: 'Get an order by order number' })
  getOrder(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.getOrder(orderNumber, user);
  }
}