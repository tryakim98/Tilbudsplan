import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
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
export const offerRuns = sqliteTable(
  "offer_runs",
  {
    id: text("id").primaryKey(),
    keyHash: text("key_hash").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    status: text("status").notNull(),
    state: text("state").notNull(),
    leaseUntil: text("lease_until"),
  },
  (t) => [index("idx_offer_runs_completed").on(t.completedAt)],
);
export const flyerPages = sqliteTable(
  "flyer_pages",
  {
    runId: text("run_id").notNull(),
    catalogId: text("catalog_id").notNull(),
    pageOffset: integer("page_offset").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.catalogId, t.pageOffset] })],
);
export const flyerPrices = sqliteTable(
  "flyer_prices",
  {
    period: text("period").notNull(),
    chainKey: text("chain_key").notNull(),
    productKey: text("product_key").notNull(),
    price: real("price").notNull(),
    observedOn: text("observed_on").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.period, t.chainKey, t.productKey, t.price] }),
    index("idx_flyer_prices_date").on(t.observedOn),
  ],
);
