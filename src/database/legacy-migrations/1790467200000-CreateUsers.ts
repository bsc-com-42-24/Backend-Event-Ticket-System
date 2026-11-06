import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1790467200000 implements MigrationInterface {
  name = 'CreateUsers1790467200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(
      'CREATE TYPE "public"."users_role_enum" AS ENUM(\'CUSTOMER\', \'EVENT_MANAGER\', \'VALIDATOR\', \'ADMIN\')',
    );
    await queryRunner.query(
      'CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT \'CUSTOMER\', "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_USERS_ID" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_USERS_EMAIL_UNIQUE" ON "users" ("email")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_USERS_EMAIL_UNIQUE"');
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TYPE "public"."users_role_enum"');
  }
}