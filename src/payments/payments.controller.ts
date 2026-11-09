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
    @Headers('paychangu-signature') signatureHeader: string,
    @Headers('x-paychangu-signature') backupSignatureHeader: string,
    @Headers('signature') legacySignature: string,
  ) {
    // Fallback order to extract the verification hash string sent by PayChangu
    const signature = signatureHeader || backupSignatureHeader || legacySignature;

    if (!signature) {
      throw new BadRequestException('Missing webhook signature verification header');
    }

    if (!request.rawBody) {
      throw new BadRequestException(
        'Raw request body is missing. Ensure rawBody parsing is active in main.ts',
      );
    }

    // Pass the raw string body buffer directly to your service for crypto timing verification
    return this.paymentsService.handleWebhook(
      request.rawBody.toString('utf8'),
      signature,
    );
  }

  @Get('paychangu/callback')
  @ApiOperation({
    summary: 'PayChangu customer return callback',
  })
  async callback(
    @Query('tx_ref') txRef: string,
  ) {
    if (!txRef) {
      throw new BadRequestException('Missing transaction reference query parameter');
    }

    // The callback route acts as a validation trigger for the customer UI thread
    return this.paymentsService.verifyPayment(txRef);
  }
}
