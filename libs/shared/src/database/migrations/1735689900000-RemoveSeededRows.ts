import { MigrationInterface, QueryRunner } from 'typeorm';

const DRAFT_TRACKS = [
  'iot',
  'mobile',
  'ai',
  'blockchain',
  'arm',
  'vision',
  'programming',
  'aerial',
];

/**
 * Removes compliance seeds only. Creates nothing.
 * Draft tracks are deleted only while they are still unpublished, unpriced,
 * and have no admin price change. Shop users, products, orders, and quotes
 * are left in place.
 */
export class RemoveSeededRows1735689900000 implements MigrationInterface {
  name = 'RemoveSeededRows1735689900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tracks = DRAFT_TRACKS.map((slug) => `'${slug}'`).join(', ');
    await queryRunner.query(`
      DELETE FROM "course_price_history" AS h
      USING "course" AS c
      WHERE h."course_id" = c."id"
        AND c."slug" IN (${tracks})
        AND c."price" IS NULL
        AND c."status" = 'draft'
        AND c."is_free" = false
        AND NOT EXISTS (
          SELECT 1 FROM "course_price_history" AS hx
          WHERE hx."course_id" = c."id"
            AND hx."changed_by" IS NOT NULL
            AND hx."deleted_at" IS NULL
        )
    `);
    await queryRunner.query(`
      DELETE FROM "course" AS c
      WHERE c."slug" IN (${tracks})
        AND c."price" IS NULL
        AND c."status" = 'draft'
        AND c."is_free" = false
        AND NOT EXISTS (
          SELECT 1 FROM "course_price_history" AS hx
          WHERE hx."course_id" = c."id"
            AND hx."changed_by" IS NOT NULL
            AND hx."deleted_at" IS NULL
        )
    `);
    await queryRunner.query(`
      DELETE FROM "email_template"
      WHERE "slug" = 'enrollment-confirmation'
    `);
  }

  public down(): Promise<void> {
    return Promise.resolve();
  }
}
