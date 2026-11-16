import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Real purchase tracking:
 *  - tickets.purchased_at     when the buyer actually got the ticket (issued_at is
 *                             only when the organizer generated it)
 *  - tickets.payment_tx_ref   the PayChangu payment that paid for it
 *  - ticket_payment_claims    one row per verified PayChangu payment, so a single
 *                             payment can never buy more tickets than it covered
 */
export class AddTicketPurchaseTracking1793000000000
  implements MigrationInterface
{
  name = 'AddTicketPurchaseTracking1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_tx_ref VARCHAR(100)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ticket_payment_claims (
        tx_ref             VARCHAR(100) PRIMARY KEY,
        customer_id        BIGINT NOT NULL
                           REFERENCES users(user_id) ON DELETE RESTRICT,
        event_id           BIGINT NOT NULL
                           REFERENCES events(event_id) ON DELETE RESTRICT,
        ticket_type_id     BIGINT NOT NULL
                           REFERENCES ticket_types(ticket_type_id) ON DELETE RESTRICT,
        amount             NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        currency           CHAR(3) NOT NULL DEFAULT 'MWK',
        provider_reference VARCHAR(150),
        status             VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        tickets_claimed    INTEGER NOT NULL DEFAULT 0 CHECK (tickets_claimed >= 0),
        verified_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_payment_tx_ref
      ON tickets(payment_tx_ref) WHERE payment_tx_ref IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_claims_customer
      ON ticket_payment_claims(customer_id)
    `);

    // Tickets that were already paid through the order/payment flow: use the
    // time PayChangu confirmed the payment as their purchase time.
    await queryRunner.query(`
      UPDATE tickets t
      SET purchased_at = p.verified_at
      FROM order_items oi
      JOIN payments p ON p.order_id = oi.order_id AND p.status = 'SUCCESS'
      WHERE t.order_item_id = oi.order_item_id
        AND t.purchased_at IS NULL
        AND p.verified_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payment_claims_customer`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tickets_payment_tx_ref`);
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_payment_claims`);
    await queryRunner.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS payment_tx_ref`);
    await queryRunner.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS purchased_at`);
  }
}
