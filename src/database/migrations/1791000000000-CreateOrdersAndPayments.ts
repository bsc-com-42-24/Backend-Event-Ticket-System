
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersAndPayments1791000000000
  implements MigrationInterface
{
  name = 'CreateOrdersAndPayments1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE orders (
        order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL UNIQUE,
        customer_id BIGINT NOT NULL,
        event_id BIGINT NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'MWK',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_orders_customer
          FOREIGN KEY (customer_id)
          REFERENCES users(user_id)
          ON DELETE RESTRICT,

        CONSTRAINT fk_orders_event
          FOREIGN KEY (event_id)
          REFERENCES events(event_id)
          ON DELETE RESTRICT
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_orders_customer
      ON orders(customer_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_orders_event
      ON orders(event_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_orders_pending_expiry
      ON orders(expires_at)
      WHERE status = 'PENDING';
    `);

    await queryRunner.query(`
      CREATE TABLE order_items (
        order_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id BIGINT NOT NULL,
        ticket_type_id BIGINT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
        subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_order_items_order
          FOREIGN KEY (order_id)
          REFERENCES orders(order_id)
          ON DELETE CASCADE,

        CONSTRAINT fk_order_items_ticket_type
          FOREIGN KEY (ticket_type_id)
          REFERENCES ticket_types(ticket_type_id)
          ON DELETE RESTRICT,

        CONSTRAINT uq_order_items_order_ticket_type
          UNIQUE (order_id, ticket_type_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_order_items_ticket_type
      ON order_items(ticket_type_id);
    `);

    await queryRunner.query(`
      CREATE TABLE payments (
        payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id BIGINT NOT NULL,
        tx_ref VARCHAR(100) NOT NULL UNIQUE,
        provider_reference VARCHAR(150),
        amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'MWK',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
        checkout_url TEXT,
        failure_reason TEXT,
        provider_metadata JSONB,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_payments_order
          FOREIGN KEY (order_id)
          REFERENCES orders(order_id)
          ON DELETE RESTRICT
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_payments_order
      ON payments(order_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_payments_provider_reference
      ON payments(provider_reference)
      WHERE provider_reference IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE payments`);
    await queryRunner.query(`DROP TABLE order_items`);
    await queryRunner.query(`DROP TABLE orders`);
  }
}
