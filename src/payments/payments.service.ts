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
  private readonly apiUrl = 'https://api.paychangu.com';

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
    // A previously verified successful payment must not be processed again.
    
    if (payment.status === 'SUCCESS') {
      const fulfillment =
        await this.ordersService.confirmPaidOrder(
          String(payment.linked_order_id),
        );

      return {
        message: 'Payment has already been verified',
        paymentStatus: 'SUCCESS',
        orderNumber: payment.order_number,
        fulfillment,
      };
    }
    if (!payment) {
      throw new NotFoundException('Payment not found');
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

    const expectedAmount = this.toCents(payment.amount);
    const receivedAmount = this.toCents(data.amount);

    if (
      !Number.isFinite(expectedAmount) ||
      !Number.isFinite(receivedAmount) ||
      receivedAmount !== expectedAmount
    ) {
      throw new BadRequestException(
        'The verified payment amount does not match the order amount',
      );
    }

    if (
      String(data.currency).trim().toUpperCase() !==
      String(payment.currency).trim().toUpperCase()
    ) {
      throw new BadRequestException(
        'The verified payment currency does not match the order currency',
      );
    }

    const providerReference =
      data.reference == null
        ? null
        : String(data.reference);

    // Mark the payment successful before attempting fulfilment.
    // If fulfilment fails, the successful payment remains recorded
    // and can be reconciled without losing the provider transaction.
    await this.database.query(
      `
      UPDATE payments
      SET status = 'SUCCESS',
          provider_reference = $1,
          provider_metadata = $2,
          verified_at = NOW(),
          failure_reason = NULL,
          updated_at = NOW()
      WHERE tx_ref = $3
        AND status <> 'SUCCESS'
      `,
      [
        providerReference,
        JSON.stringify(result),
        txRef,
      ],
    );

    const fulfillment =
      await this.ordersService.confirmPaidOrder(
        String(payment.linked_order_id),
      );

    return {
      message: fulfillment.fulfilled
        ? 'Payment verified and tickets issued'
        : 'Payment verified, but the order could not be fulfilled automatically',
      paymentStatus: 'SUCCESS',
      orderNumber: payment.order_number,
      fulfillment,
    };
  }
  verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  ): boolean {
  const secret = this.config.get<string>(
    'PAYCHANGU_WEBHOOK_SECRET',
  );

  if (!secret || !rawBody || !signature) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest();

  const suppliedHex = signature
    .replace(/^sha256=/i, '')
    .trim();

  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) {
    return false;
  }

  const supplied = Buffer.from(suppliedHex, 'hex');

  if (supplied.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(expected, supplied);
  }

  async handleWebhook(payload: any) {
    const txRef =
      payload?.tx_ref ??
      payload?.data?.tx_ref;

    if (!txRef || typeof txRef !== 'string') {
      throw new BadRequestException(
        'Webhook does not contain a transaction reference',
      );
    }

    // Do not trust the webhook's status by itself.
    // Always ask PayChangu to verify the transaction.
    return this.verifyPayment(txRef);
  }

  async handleCallback(txRef: string) {
    if (!txRef) {
      throw new BadRequestException(
        'Transaction reference is required',
      );
    }

    return this.verifyPayment(txRef);
  }
}