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

const DEMO_EMAILS = [
  'admin@regaliaelectrical.ng',
  'bayonuga@example.com',
  'chioma.okafor@example.com',
  'ibrahim.musa@example.com',
  'adesuwa.eze@example.com',
  'tunde.balogun@example.com',
  'fatima.abdullahi@example.com',
  'chinedu.okeke@example.com',
  'amaka.nwosu@example.com',
  'yusuf.bello@example.com',
  'funke.adebayo@example.com',
  'emeka.obi@example.com',
];

const DEMO_PRODUCT_SLUGS = [
  'arduino-uno-r3',
  'raspberry-pi-4-model-b',
  '12v-5a-power-supply',
  'dht22-temp-humidity',
  'oled-128x64-display',
  'arduino-nano',
  'esp32-devkit-v1',
  'nema-17-stepper-motor',
  'hc-sr04-ultrasonic',
  'breadboard-830',
];

/**
 * Removes rows inserted by earlier seeds. Creates nothing.
 * Draft tracks are removed only while they are still unpublished, unpriced,
 * and have no admin price change. Shop tables are touched only when present.
 */
export class RemoveSeededRows1735689900000 implements MigrationInterface {
  name = 'RemoveSeededRows1735689900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tracks = sqlList(DRAFT_TRACKS);
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

    if (await tableExists(queryRunner, 'shop_order')) {
      await queryRunner.query(`
        DELETE FROM "shop_order"
        WHERE "idempotency_key" LIKE 'seed-order-%'
      `);
    }
    if (await tableExists(queryRunner, 'quote')) {
      await queryRunner.query(`
        DELETE FROM "quote"
        WHERE "reference" ~ '^QTE-[0-9]{4}-180[0-5]$'
      `);
    }
    if (await tableExists(queryRunner, 'product')) {
      const slugs = sqlList(DEMO_PRODUCT_SLUGS);
      if (await tableExists(queryRunner, 'cart_item')) {
        await queryRunner.query(`
          DELETE FROM "cart_item"
          WHERE "product_id" IN (
            SELECT "id" FROM "product" WHERE "slug" IN (${slugs})
          )
        `);
      }
      if (await tableExists(queryRunner, 'inventory')) {
        await queryRunner.query(`
          DELETE FROM "inventory"
          WHERE "product_id" IN (
            SELECT "id" FROM "product" WHERE "slug" IN (${slugs})
          )
        `);
      }
      await queryRunner.query(`
        DELETE FROM "product" WHERE "slug" IN (${slugs})
      `);
    }
    if (await tableExists(queryRunner, 'user')) {
      const emails = sqlList(DEMO_EMAILS);
      const userIds = `(SELECT "id" FROM "user" WHERE "email" IN (${emails}))`;
      if (await tableExists(queryRunner, 'refresh_token')) {
        await queryRunner.query(
          `DELETE FROM "refresh_token" WHERE "user_id" IN ${userIds}`,
        );
      }
      if (await tableExists(queryRunner, 'user_role')) {
        await queryRunner.query(
          `DELETE FROM "user_role" WHERE "user_id" IN ${userIds}`,
        );
      }
      if (await tableExists(queryRunner, 'cart_item')) {
        await queryRunner.query(
          `DELETE FROM "cart_item" WHERE "user_id" IN ${userIds}`,
        );
      }
      if (await tableExists(queryRunner, 'shop_order')) {
        await queryRunner.query(
          `DELETE FROM "shop_order" WHERE "user_id" IN ${userIds}`,
        );
      }
      if (await tableExists(queryRunner, 'quote')) {
        await queryRunner.query(
          `DELETE FROM "quote" WHERE "user_id" IN ${userIds}`,
        );
      }
      await queryRunner.query(
        `DELETE FROM "user" WHERE "email" IN (${emails})`,
      );
    }
  }

  public down(): Promise<void> {
    return Promise.resolve();
  }
}

function sqlList(values: string[]) {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

async function tableExists(queryRunner: QueryRunner, table: string) {
  const rows: unknown = await queryRunner.query(
    `SELECT to_regclass($1) AS name`,
    [`public.${table}`],
  );
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const first: unknown = rows[0];
  if (!first || typeof first !== 'object' || !('name' in first)) return false;
  return typeof first.name === 'string' && first.name.length > 0;
}
