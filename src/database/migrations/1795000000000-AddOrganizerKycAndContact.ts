import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizerKycAndContact1795000000000
  implements MigrationInterface
{
  name = 'AddOrganizerKycAndContact1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizer_kyc (
        kyc_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        organizer_id BIGINT NOT NULL UNIQUE
          REFERENCES users(user_id) ON DELETE CASCADE,
        business_name VARCHAR(200) NOT NULL,
        registration_number VARCHAR(100),
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        reviewer_notes TEXT,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMPTZ,
        CONSTRAINT organizer_kyc_status_check
          CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organizer_kyc_status
      ON organizer_kyc(status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        contact_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
      ON contact_messages(created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contact_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizer_kyc`);

    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS is_verified
    `);
  }
}
