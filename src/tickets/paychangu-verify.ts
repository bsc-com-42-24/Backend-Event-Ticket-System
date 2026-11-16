import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface VerifiedPayChanguPayment {
  txRef: string;
  amount: number;
  currency: string;
  reference: string | null;
}

interface PayChanguVerifyBody {
  data?: {
    tx_ref?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    reference?: unknown;
  } | null;
}

const TX_REF_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Whether POST /tickets/purchase must be backed by a verified payment.
 * PURCHASE_REQUIRES_PAYMENT=true|false always wins; otherwise a payment is
 * required everywhere except under Jest (NODE_ENV=test).
 */
export function purchaseRequiresPayment(): boolean {
  const flag = process.env.PURCHASE_REQUIRES_PAYMENT?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

/**
 * Asks PayChangu (server to server, with the secret key) whether a payment
 * really succeeded. The browser is never trusted for this.
 */
export async function verifyPayChanguPayment(
  txRef: string,
): Promise<VerifiedPayChanguPayment> {
  if (!TX_REF_PATTERN.test(txRef)) {
    throw new BadRequestException('Invalid payment reference');
  }

  const secret = process.env.PAYCHANGU_SECRET_KEY;
  if (!secret) {
    throw new ServiceUnavailableException(
      'PayChangu has not been configured on the server (PAYCHANGU_SECRET_KEY)',
    );
  }
  const baseUrl = (
    process.env.PAYCHANGU_API_URL || 'https://api.paychangu.com'
  ).replace(/\/$/, '');

  let response: Response;
  try {
    response = await fetch(
      baseUrl + '/verify-payment/' + encodeURIComponent(txRef),
      {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + secret, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new BadGatewayException(
      'Unable to contact PayChangu to verify the payment',
    );
  }
  if (response.status === 404) {
    throw new BadRequestException('No such payment');
  }

  let body: PayChanguVerifyBody | null = null;
  try {
    body = (await response.json()) as PayChanguVerifyBody;
  } catch {
    body = null;
  }
  const data = body?.data;
  if (!response.ok || !data) {
    throw new BadGatewayException('PayChangu could not verify the payment');
  }

  if (String(data.tx_ref) !== txRef) {
    throw new BadRequestException('Payment reference does not match');
  }
  const status = String(data.status).toLowerCase();
  if (status !== 'success') {
    throw new BadRequestException(
      status === 'pending' || status === 'processing'
        ? 'The payment is still pending'
        : 'The payment was not completed',
    );
  }
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadGatewayException('PayChangu returned an invalid amount');
  }

  return {
    txRef,
    amount,
    currency: String(data.currency ?? '').trim().toUpperCase(),
    reference: data.reference == null ? null : String(data.reference),
  };
}
