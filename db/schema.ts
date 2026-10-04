import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", {
  keyHash: text("key_hash").primaryKey(),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
