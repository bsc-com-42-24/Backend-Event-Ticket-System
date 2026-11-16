import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PaymentsService } from './payments.service';
import type { RawBodyRequest } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('orders/:orderNumber/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start PayChangu checkout for an order',
  })
  startPayment(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.startPayment(
      orderNumber,
      user,
    );
  }

  @Get(':txRef/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a PayChangu payment',
  })
  
  verifyPayment(
    @Param('txRef') txRef: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.verifyPayment(txRef, user);
  }

  @Post('paychangu/webhook')
  @ApiOperation({
    summary: 'Receive PayChangu webhook notifications',
  })
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('signature') signature: string,
  ) {
    const valid =
      this.paymentsService.verifyWebhookSignature(
        request.rawBody,
        signature,
      );

    if (!valid) {
      throw new BadRequestException(
        'Invalid webhook signature',
      );
    }

    return this.paymentsService.handleWebhook(
      request.body,
    );
  }

  @Get('paychangu/callback')
  @ApiOperation({
    summary: 'PayChangu customer return callback',
  })
  callback(
    @Query('tx_ref') txRef: string,
  ) {
    return this.paymentsService.handleCallback(txRef);
  }
}
