import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an admin hide a sent campaign. Adds a column only. Does not insert rows.
 */
export class EmailCampaignHiddenAt1735690600000 implements MigrationInterface {
  name = 'EmailCampaignHiddenAt1735690600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_campaign"
      ADD COLUMN IF NOT EXISTS "hidden_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_campaign" DROP COLUMN IF EXISTS "hidden_at";
    `);
  }
}
