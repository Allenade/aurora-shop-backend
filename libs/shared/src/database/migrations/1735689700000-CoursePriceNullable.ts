import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prices are set only from the compliance dashboard.
 * Drops NOT NULL / default on course.price and unpublishes the eight
 * seeded tracks unless an admin has already recorded a price change.
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
    await queryRunner.query(`
      INSERT INTO "course" (
        "slug", "name", "description", "price", "currency", "is_free", "status", "sort_order"
      )
      VALUES
        ('iot', 'Internet of Things', 'Connected devices, sensors, and embedded networking.', NULL, 'NGN', false, 'draft', 0),
        ('mobile', 'Mobile Development', 'Mobile application engineering.', NULL, 'NGN', false, 'draft', 1),
        ('ai', 'Artificial Intelligence', 'Applied machine learning and AI systems.', NULL, 'NGN', false, 'draft', 2),
        ('blockchain', 'Blockchain', 'Distributed ledgers and smart contracts.', NULL, 'NGN', false, 'draft', 3),
        ('arm', 'ARM Embedded Systems', 'ARM architecture and embedded firmware.', NULL, 'NGN', false, 'draft', 4),
        ('vision', 'Computer Vision', 'Image understanding and vision systems.', NULL, 'NGN', false, 'draft', 5),
        ('programming', 'Programming', 'Software engineering fundamentals.', NULL, 'NGN', false, 'draft', 6),
        ('aerial', 'Aerial Robotics', 'Drones and aerial robotic systems.', NULL, 'NGN', false, 'draft', 7)
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    // Forward-only. Restoring a catalogue price is not allowed.
    void queryRunner;
    return Promise.resolve();
  }
}
