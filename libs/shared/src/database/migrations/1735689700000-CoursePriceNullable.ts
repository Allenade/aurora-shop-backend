import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prices are set only from the compliance dashboard.
 * Drops NOT NULL / default on course.price. Does not insert courses.
 * Databases that already have the eight draft tracks are unpublished here
 * unless an admin recorded a price change. A later migration deletes those
 * untouched drafts.
 */
export class CoursePriceNullable1735689700000 implements MigrationInterface {
  name = 'CoursePriceNullable1735689700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course" ALTER COLUMN "price" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "course" ALTER COLUMN "price" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "course_price_history" ALTER COLUMN "new_price" DROP NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "course" AS c
      SET
        "price" = NULL,
        "status" = CASE WHEN c."is_free" THEN c."status" ELSE 'draft' END
      WHERE c."slug" IN (
        'iot', 'mobile', 'ai', 'blockchain', 'arm', 'vision', 'programming', 'aerial'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "course_price_history" h
        WHERE h."course_id" = c."id"
          AND h."changed_by" IS NOT NULL
          AND h."deleted_at" IS NULL
      )
    `);
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    // Forward-only. Restoring a catalogue price is not allowed.
    void queryRunner;
    return Promise.resolve();
  }
}
