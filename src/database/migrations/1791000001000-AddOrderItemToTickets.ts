import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

export class AddOrderItemToTickets1791000001000
  implements MigrationInterface
{
  name = 'AddOrderItemToTickets1791000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tickets
      ADD COLUMN order_item_id BIGINT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT FK_tickets_order_items
      FOREIGN KEY (order_item_id)
      REFERENCES order_items(order_item_id)
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_tickets_order_item_id
      ON tickets(order_item_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_tickets_order_item_id
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
      DROP CONSTRAINT IF EXISTS FK_tickets_order_items
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
      DROP COLUMN IF EXISTS order_item_id
    `);
  }
}
