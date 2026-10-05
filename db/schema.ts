import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", {
  keyHash: text("key_hash").primaryKey(),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const offerSnapshots = sqliteTable(
  "offer_snapshots",
  {
    period: text("period").primaryKey(),
    generated: text("generated").notNull(),
    payload: text("payload").notNull(),
    insertedAt: text("inserted_at").notNull(),
  },
  (table) => [index("idx_offer_snapshots_generated").on(table.generated)],
);
