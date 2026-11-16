import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organizer-managed check-in staff:
 *  - organizer_staff          which organizer owns which CHECK_IN_STAFF account
 *  - staff_event_assignments  which events a staff member may validate tickets for
 *  - ticket_validations       now accepts the NOT_ASSIGNED rejection reason
 *
 * Nothing here deletes or rewrites existing users, tickets or validation
 * history. Staff accounts created before this migration (e.g. by an admin)
 * have no owner and no assignments, so they cannot validate tickets until an
 * organizer creates/assigns staff through the new endpoints.
 */
export class AddOrganizerStaff1794000000000 implements MigrationInterface {
  name = 'AddOrganizerStaff1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizer_staff (
        staff_id     BIGINT PRIMARY KEY
                     REFERENCES users(user_id) ON DELETE CASCADE,
        organizer_id BIGINT NOT NULL
                     REFERENCES users(user_id) ON DELETE RESTRICT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organizer_staff_organizer
      ON organizer_staff(organizer_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS staff_event_assignments (
        staff_id    BIGINT NOT NULL
                    REFERENCES organizer_staff(staff_id) ON DELETE CASCADE,
        event_id    BIGINT NOT NULL
                    REFERENCES events(event_id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (staff_id, event_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_assignments_event
      ON staff_event_assignments(event_id)
    `);

    // ticket_validations.reason is limited by a CHECK constraint that lists the
    // allowed reasons. Find it by its definition (its generated name can differ
    // between environments), then replace it with one that includes NOT_ASSIGNED.
    await queryRunner.query(`
      DO $$
      DECLARE c RECORD;
      BEGIN
        FOR c IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'ticket_validations'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%EVENT_CANCELLED%'
        LOOP
          EXECUTE format('ALTER TABLE ticket_validations DROP CONSTRAINT %I', c.conname);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE ticket_validations
      ADD CONSTRAINT ticket_validations_result_reason_check CHECK (
        (result = 'ACCEPTED' AND reason IS NULL)
        OR (result = 'REJECTED' AND reason IN (
          'NOT_FOUND', 'ALREADY_USED', 'CANCELLED', 'WRONG_EVENT',
          'EVENT_CANCELLED', 'NOT_ASSIGNED'
        ))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Old audit rows with the new reason would violate the old constraint.
    await queryRunner.query(`
      UPDATE ticket_validations SET reason = 'NOT_FOUND'
      WHERE reason = 'NOT_ASSIGNED'
    `);
    await queryRunner.query(`
      ALTER TABLE ticket_validations
      DROP CONSTRAINT IF EXISTS ticket_validations_result_reason_check
    `);
    await queryRunner.query(`
      ALTER TABLE ticket_validations
      ADD CONSTRAINT ticket_validations_check CHECK (
        (result = 'ACCEPTED' AND reason IS NULL)
        OR (result = 'REJECTED' AND reason IN (
          'NOT_FOUND', 'ALREADY_USED', 'CANCELLED', 'WRONG_EVENT', 'EVENT_CANCELLED'
        ))
      )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS staff_event_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizer_staff`);
  }
}
