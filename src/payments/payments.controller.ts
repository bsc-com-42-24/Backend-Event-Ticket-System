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
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Payment } from './entities/payment.entity';

@ApiTags('Payments Management')
@Controller('management/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Record a new payment transaction attempt for an order',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Payment record created in PENDING state.',
    type: Payment,
  })
  @ApiResponse({ status: 400, description: 'Order expired or invalid amount.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  create(@Body() dto: CreatePaymentDto): Promise<Payment> {
    return this.paymentsService.createPayment(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment transaction details by ID' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Payment details retrieved.',
    type: Payment,
  })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Payment> {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a payment transaction',
    description:
      'Marks the payment as CONFIRMED. If accumulated confirmed payments cover the order balance, transitions order to PAID.',
  })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiBody({ type: ConfirmPaymentDto })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully.',
    type: Payment,
  })
  @ApiResponse({
    status: 400,
    description: 'Payment already confirmed or order is cancelled/expired.',
  })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPaymentDto,
  ): Promise<Payment> {
    return this.paymentsService.confirmPayment(id, dto);
  }

  @Patch(':id/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a payment transaction as FAILED' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Payment marked as failed.',
    type: Payment,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot fail an already confirmed payment.',
  })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  markFailed(@Param('id', ParseUUIDPipe) id: string): Promise<Payment> {
    return this.paymentsService.markFailed(id);
  }

  @Patch(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refund a confirmed payment transaction',
    description:
      'Issues a refund on a confirmed payment, updates the associated order status to REFUNDED, and returns ticket stock to inventory.',
  })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiBody({ type: RefundPaymentDto })
  @ApiResponse({
    status: 200,
    description: 'Payment successfully refunded.',
    type: Payment,
  })
  @ApiResponse({
    status: 400,
    description: 'Only CONFIRMED payments can be refunded.',
  })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<Payment> {
    return this.paymentsService.refundPayment(id, dto);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'List all payments associated with an order' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of order payment transactions.',
    type: [Payment],
  })
  findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Payment[]> {
    return this.paymentsService.findByOrder(orderId);
  }

  @Get('event/:eventId')
  @ApiOperation({ summary: 'List all payments associated with an event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of event payment transactions.',
    type: [Payment],
  })
  findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<Payment[]> {
    return this.paymentsService.findByEvent(eventId);
  }
}
