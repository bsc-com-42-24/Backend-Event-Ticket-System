import {
  createHmac,
  timingSafeEqual,
} from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { DatabaseService } from '../database/database.service';
import { OrdersService } from '../orders/orders.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';

@Injectable()
export class PaymentsService {
  private readonly apiUrl = 'https://paychangu.com';

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  private getSecretKey(): string {
    const key = this.config.get<string>('PAYCHANGU_SECRET_KEY');

    if (!key) {
      throw new ServiceUnavailableException(
        'PayChangu has not been configured',
      );
    }

    return key;
  }

  private getRequiredUrl(name: string): string {
    const value = this.config.get<string>(name);

    if (!value) {
      throw new ServiceUnavailableException(
        `${name} has not been configured`,
      );
    }

    return value;
  }

  private toCents(value: unknown): number {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return NaN;
    }

    return Math.round(amount * 100);
  }

  async startPayment(
    orderNumber: string,
    user: AuthenticatedUser,
  ) {
    const orderResult = await this.database.query(
      `
      SELECT *
      FROM orders
      WHERE order_number = $1
      `,
      [orderNumber],
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException('Order not found');
    }

    const order = orderResult.rows[0];

    if (
      String(order.customer_id) !== String(user.userId) &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        'You cannot pay for this order',
      );
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        'This order is not awaiting payment',
      );
    }

    if (new Date(order.expires_at) <= new Date()) {
      throw new BadRequestException(
        'This order has expired. Please create a new order.',
      );
    }

    const txRef = `TM-${randomUUID()}`;

    const paymentResult = await this.database.query(
      `
      INSERT INTO payments (
        order_id,
        tx_ref,
        amount,
        currency,
        status
      )
      VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING *
      `,
      [
        order.order_id,
        txRef,
        order.total_amount,
        order.currency,
      ],
    );

    const payment = paymentResult.rows[0];

    try {
      const response = await fetch(`${this.apiUrl}/payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getSecretKey()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: String(order.total_amount),
          currency: order.currency.trim(),
          tx_ref: txRef,
          callback_url: this.getRequiredUrl(
            'PAYCHANGU_CALLBACK_URL',
          ),
          return_url: this.getRequiredUrl(
            'PAYCHANGU_RETURN_URL',
          ),
          email: user.email,
          customization: {
            title: 'Ticket Master',
            description: `Payment for order ${order.order_number}`,
          },
          meta: {
            order_number: order.order_number,
          },
        }),
      });

      const result = await response.json();

      if (
        !response.ok ||
        result.status !== 'success' ||
        !result.data?.checkout_url
      ) {
        throw new Error(
          result.message || 'PayChangu checkout could not be created',
        );
      }

      await this.database.query(
        `
        UPDATE payments
        SET checkout_url = $1,
            provider_metadata = $2,
            updated_at = NOW()
        WHERE payment_id = $3
        `,
        [
          result.data.checkout_url,
          JSON.stringify(result),
          payment.payment_id,
        ],
      );

      return {
        message: 'Payment checkout created',
        txRef,
        checkoutUrl: result.data.checkout_url,
        amount: order.total_amount,
        currency: order.currency.trim(),
      };
    } catch (error) {
      await this.database.query(
        `
        UPDATE payments
        SET status = 'FAILED',
            failure_reason = $1,
            updated_at = NOW()
        WHERE payment_id = $2
        `,
        [
          error instanceof Error
            ? error.message
            : 'Unable to create checkout',
          payment.payment_id,
        ],
      );

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new BadGatewayException(
        'Could not create PayChangu checkout. Please try again.',
      );
    }
  }

  async verifyPayment(
    txRef: string,
    user?: AuthenticatedUser,
  ) {
    const paymentResult = await this.database.query(
      `
      SELECT
        p.*,
        o.order_id AS linked_order_id,
        o.order_number,
        o.customer_id,
        o.status AS order_status,
        o.expires_at
      FROM payments p
      INNER JOIN orders o
        ON o.order_id = p.order_id
      WHERE p.tx_ref = $1
      `,
      [txRef],
    );

    if (paymentResult.rows.length === 0) {
      throw new NotFoundException('Payment not found');
    }

    const payment = paymentResult.rows[0];

    if (
      user &&
      user.role !== UserRole.ADMIN &&
      String(payment.customer_id) !== String(user.userId)
    ) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'SUCCESS') {
      const fulfillment = await this.ordersService.confirmPaidOrder(
        String(payment.linked_order_id),
      );

      return {
        message: 'Payment has already been verified',
        paymentStatus: 'SUCCESS',
        orderNumber: payment.order_number,
        fulfillment,
      };
    }

    let response: Response;

    try {
      response = await fetch(
        `${this.apiUrl}/verify-payment/${encodeURIComponent(txRef)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.getSecretKey()}`,
            Accept: 'application/json',
          },
        },
      );
    } catch {
      throw new BadGatewayException(
        'Unable to contact PayChangu for transaction verification',
      );
    }

    const result = await response.json();

    if (!response.ok || result.status !== 'success') {
      throw new BadGatewayException(
        'PayChangu transaction verification failed',
      );
    }

    const data = result.data;

    if (!data) {
      throw new BadGatewayException(
        'PayChangu returned an invalid verification response',
      );
    }

    if (String(data.tx_ref) !== String(txRef)) {
      throw new BadRequestException(
        'Transaction reference does not match',
      );
    }

    const verifiedStatus = String(data.status).toLowerCase();

    if (verifiedStatus !== 'success') {
      const newStatus =
        verifiedStatus === 'cancelled'
          ? 'CANCELLED'
          : verifiedStatus === 'failed'
            ? 'FAILED'
            : 'PENDING';

      await this.database.query(
        `
        UPDATE payments
        SET status = $1,
            provider_metadata = $2,
            updated_at = NOW()
        WHERE tx_ref = $3
          AND status <> 'SUCCESS'
        `,
        [
          newStatus,
          JSON.stringify(result),
          txRef,
        ],
      );

      return {
        message: 'Payment has not been completed',
        paymentStatus: newStatus,
      };
    }

    const expectedCents = this.toCents(payment.amount);
    const receivedCents = this.toCents(data.amount);

    if (
      isNaN(expectedCents) ||
      isNaN(receivedCents) ||
      expectedCents !== receivedCents ||
      String(data.currency).toLowerCase().trim() !== String(payment.currency).toLowerCase().trim()
    ) {
      await this.database.query(
        `
        UPDATE payments
        SET status = 'FAILED',
            failure_reason = 'Amount or currency mismatch during verification',
            provider_metadata = $1,
            updated_at = NOW()
        WHERE tx_ref = $2
          AND status <> 'SUCCESS'
        `,
        [JSON.stringify(result), txRef],
      );
      throw new BadRequestException('Payment verification failed: amount/currency mismatch');
    }

    await this.database.query(
      `
      UPDATE payments
      SET status = 'SUCCESS',
          provider_metadata = $1,
          updated_at = NOW()
      WHERE tx_ref = $2
      `,
      [JSON.stringify(result), txRef],
    );

    const fulfillment = await this.ordersService.confirmPaidOrder(
      String(payment.linked_order_id),
    );

    return {
      message: 'Payment verified successfully',
      paymentStatus: 'SUCCESS',
      orderNumber: payment.order_number,
      fulfillment,
    };
  }

  async handleWebhook(rawBody: string, signature: string) {
    const webhookSecret = this.config.get<string>('PAYCHANGU_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Webhook validation is not configured');
    }

    const computedSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const computedBuffer = Buffer.from(computedSignature, 'utf8');

    if (
      signatureBuffer.length !== computedBuffer.length ||
      !timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    const txRef = payload?.tx_ref ?? payload?.data?.tx_ref;

    if (!txRef) {
      throw new BadRequestException('Webhook is missing tx_ref');
    }

    // Don't trust the webhook body for status or amount.
    // Re-verify directly with PayChangu and fulfill the order.
    const result = await this.verifyPayment(String(txRef));

    return {
      message: 'Webhook processed',
      paymentStatus: result.paymentStatus,
    };
  }
}