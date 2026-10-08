import { sql } from 'drizzle-orm';
import { text, timestamp } from 'drizzle-orm/pg-core';

export const textId = () => text('id').notNull().default(sql`gen_random_uuid()::text`);
export const time = (name: string) => timestamp(name, { withTimezone: true });
export const timestamps = () => ({
  createdAt: time('created_at').defaultNow().notNull(),
  updatedAt: time('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});
