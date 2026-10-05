import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../worker/index.js";
import {
  startCollection,
  authorizedRun,
  stepCollection,
  collectionResult,
  normalizeSourceOffer,
  collectionCoverage,
} from "../worker/collection.js";
import {
  cleanOffers,
  emptyProfile,
  availableOffers,
  offerFor,
  makePlan,
  basket,
  advertisedBasketSaving,
} from "../dist/engine.js";
import { comparison, priceBasis, productKey } from "../dist/offers.js";
const now = new Date("2026-10-05T12:00:00Z");
function storage() {
  const sql = new DatabaseSync(":memory:");
  for (const n of readdirSync(new URL("../drizzle", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync(new URL("../drizzle/" + n, import.meta.url), "utf8"));
  const statement = (query, values = []) => ({
    bind(...v) {
      return statement(query, v);
    },
    async run() {
      return { meta: { changes: sql.prepare(query).run(...values).changes } };
    },
    async first() {
      return sql.prepare(query).get(...values) || null;
    },
    async all() {
      return { results: sql.prepare(query).all(...values) };
    },
  });
  return {
    sql,
    env: {
      DB: {
        prepare: statement,
        async batch(items) {
          const r = [];
          for (const i of items) r.push(await i.run());
          return r;
        },
      },
    },
  };
}
const chain = {
  name: "MENY",
  publicId: "chain",
  countryCode: "NO",
  primaryCategoryId: "groceries",
  isEnabled: true,
  slugs: ["MENY"],
};
const cat = {
  id: "catalog-a",
  dealer_id: "chain",
  label: "Uke 41",
  offer_count: 102,
  page_count: 10,
  all_stores: false,
  run_from: "2026-10-05T00:00:00Z",
  run_till: "2026-10-11T23:59:59Z",
};
const catalog = {
  id: "catalog-a",
  sourceId: "chain",
  chain: "meny",
  label: "Meny",
  slug: "MENY",
  title: "Uke 41",
  regional: true,
  validFrom: cat.run_from,
  validUntil: cat.run_till,
};
const raw = (id, extra = {}) => ({
  publicId: String(id),
  name: "Kyllingfilet",
  description: "400 g",
  publicationPublicId: "catalog-a",
  businessPublicId: "chain",
  currencyCode: "NOK",
  price: 40,
  savings: 40,
  unitSymbol: "g",
  unitSizeFrom: 400,
  unitSizeTo: 400,
  pieceCountFrom: 1,
  pieceCountTo: 1,
  unitPrice: 100,
  baseUnit: "kilogram",
  ...extra,
});
function sourceMock({ gap = false, repeat = false, fail = false } = {}) {
  const offsets = [];
  return {
    offsets,
    async fetch(url, init = {}) {
      if (String(url).startsWith("https://squid-api.tjek.com/v2/offers"))
        return Response.json([]);
      if (String(url).startsWith("https://squid-api.tjek.com/v2/catalogs")) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        return Response.json(
          offset === 0
            ? [cat, { ...cat, id: "catalog-b", offer_count: 1 }]
            : [],
        );
      }
      assert.equal(String(url), "https://etilbudsavis.no/");
      const refs = JSON.parse(init.body).data;
      return new Response(
        refs
          .map((key) => {
            const [type, p] = JSON.parse(atob(key));
            let value;
            if (type === "businesses")
              value = [
                chain,
                { ...chain, name: "Norsk ny kjede", publicId: "empty-chain" },
                { ...chain, countryCode: "DE", publicId: "foreign" },
              ];
            if (type === "fronts")
              value = [{ business: chain, publications: [{ id: cat.id }] }];
            if (type === "offers") {
              const id = p.publicationIds[0],
                offset = p.pagination.offset;
              offsets.push({ id, offset });
              if (fail && id === "catalog-b")
                return JSON.stringify({
                  key,
                  status: "error",
                  error: { message: "Avisen er utilgjengelig" },
                });
              const products =
                id === "catalog-b"
                  ? offset === 0
                    ? [
                        raw("regional", {
                          publicationPublicId: "catalog-b",
                          name: "Ukjent produkt",
                          price: null,
                        }),
                      ]
                    : []
                  : repeat
                    ? [raw(1)]
                    : offset === 0
                      ? Array.from({ length: 100 }, (_, i) =>
                          raw(i, { name: "Vare " + i }),
                        )
                      : offset === 100
                        ? [raw(100), ...(gap ? [] : [raw(101)])]
                        : [];
              value = {
                data: products,
                metadata: { pagination: p.pagination },
              };
            }
            return JSON.stringify({ key, status: "success", value });
          })
          .join("\n"),
      );
    },
  };
}
async function collect(env, start) {
  let r = start;
  for (let i = 0; r.status === "collecting"; i++) {
    assert.ok(i < 10);
    r = await stepCollection(
      env,
      await authorizedRun(env, start.id, start.key),
      now,
    );
  }
  return collectionResult(
    env,
    await authorizedRun(env, start.id, start.key),
    now,
  );
}

test("full collection paginates past short pages, retains unmatched and regional offers, and archives trusted data", async () => {
  const original = globalThis.fetch,
    mock = sourceMock();
  globalThis.fetch = mock.fetch;
  const { env, sql } = storage();
  try {
    const start = await startCollection(env, now);
    assert.equal(start.coverage.surveyedChains, 2);
    assert.equal(start.coverage.catalogsTotal, 2);
    assert.equal(start.coverage.complete, false);
    assert.equal(await authorizedRun(env, start.id, "0".repeat(48)), null);
    const result = await collect(env, start);
    assert.equal(result.status, "complete");
    assert.equal(result.meta.coverage.offersFetched, 103);
    assert.equal(result.products.length, 103);
    assert.equal(cleanOffers(result.products).length, 103);
    assert.ok(
      result.products.some(
        (o) => o.name === "Ukjent produkt" && o.price === null,
      ),
    );
    assert.deepEqual(
      mock.offsets.filter((x) => x.id === cat.id).map((x) => x.offset),
      [0, 100, 200],
    );
    const row = sql.prepare("SELECT key_hash FROM offer_runs").get();
    assert.notEqual(row.key_hash, start.key);
    assert.equal(
      sql.prepare("SELECT COUNT(*) n FROM flyer_prices").get().n,
      101,
    );
    const cached = await startCollection(
      env,
      new Date(now.valueOf() + 5 * 60000),
    );
    assert.equal(cached.status, "complete");
    assert.equal(cached.coverage.cachedCatalogs, 2);
    const cachedData = await collectionResult(
      env,
      await authorizedRun(env, cached.id, cached.key),
      new Date(now.valueOf() + 5 * 60000),
    );
    assert.equal(cachedData.meta.generated, result.meta.generated);
    const fresh = await startCollection(env, now, true);
    assert.equal(fresh.status, "collecting");
    assert.equal(fresh.coverage.cachedCatalogs, 0);
    await collect(env, fresh);
    assert.equal(
      sql.prepare("SELECT COUNT(*) n FROM flyer_prices").get().n,
      101,
    );
    const product = result.products.find((o) => o.name === "Kyllingfilet");
    const insert = sql.prepare(
      "INSERT INTO flyer_prices(period,chain_key,product_key,price,observed_on) VALUES (?,?,?,?,?)",
    );
    for (const [period, price, date] of [
      ["2026-W39", 50, "2026-09-22"],
      ["2026-W39", 60, "2026-09-22"],
      ["2026-W40", 70, "2026-09-28"],
    ])
      insert.run(period, "meny", productKey(product), price, date);
    const historical = await collectionResult(
      env,
      await authorizedRun(env, start.id, start.key),
      now,
    );
    const h = historical.products.find(
      (o) => o.name === "Kyllingfilet",
    ).history;
    assert.equal(h.mean, 62.5);
    assert.equal(h.weeks, 2);
    assert.equal(h.min, 50);
    assert.equal(h.max, 70);
    const read = await worker.fetch(
      new Request("https://test.local/api/offers"),
      env,
    );
    assert.equal(read.status, 200);
    assert.equal((await read.json()).products.length, 103);
    sql
      .prepare("DELETE FROM flyer_pages WHERE run_id=? AND catalog_id=?")
      .run(cached.id, cat.id);
    const damaged = await collectionResult(
      env,
      await authorizedRun(env, cached.id, cached.key),
      now,
    );
    assert.equal(damaged.status, "incomplete");
    assert.equal(damaged.meta.coverage.complete, false);
    assert.ok(
      damaged.meta.coverage.catalogs.some((c) => /Lagrede/.test(c.error || "")),
    );
  } finally {
    globalThis.fetch = original;
    sql.close();
  }
});

test("source gaps, failed publications and repeated pages never become a complete collection", async () => {
  const original = globalThis.fetch;
  for (const options of [{ gap: true }, { fail: true }, { repeat: true }]) {
    const { env, sql } = storage();
    globalThis.fetch = sourceMock(options).fetch;
    try {
      const result = await collect(env, await startCollection(env, now));
      assert.equal(result.status, "incomplete");
      assert.equal(result.meta.coverage.complete, false);
      assert.ok(result.meta.coverage.gaps > 0);
      if (options.gap) assert.equal(result.meta.coverage.missing, 1);
      if (options.repeat)
        assert.ok(
          result.meta.coverage.catalogs.some((c) =>
            /gjentar/.test(c.error || ""),
          ),
        );
    } finally {
      sql.close();
    }
  }
  globalThis.fetch = original;
  assert.equal(
    collectionCoverage({
      chains: [],
      catalogs: [
        { ...catalog, expected: 0, count: 0, done: true, error: null },
      ],
    }).complete,
    false,
  );
});

test("public collection has scoped job authentication and rejects cross-origin writes", async () => {
  const original = globalThis.fetch,
    mock = sourceMock();
  globalThis.fetch = mock.fetch;
  const { env, sql } = storage();
  try {
    assert.equal(
      (
        await worker.fetch(
          new Request("https://test.local/api/collection", {
            method: "POST",
            headers: { origin: "https://other.example" },
          }),
          env,
        )
      ).status,
      403,
    );
    const r = await worker.fetch(
      new Request("https://test.local/api/collection", {
        method: "POST",
        body: JSON.stringify({ products: [{ price: 0 }] }),
      }),
      env,
    );
    assert.equal(r.status, 201);
    const start = await r.json();
    assert.equal(
      (
        await worker.fetch(
          new Request(
            "https://test.local/api/collection/" + start.id + "/step",
            { method: "POST" },
          ),
          env,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await worker.fetch(
          new Request(
            "https://test.local/api/collection/" + start.id + "/step",
            {
              method: "POST",
              headers: { authorization: "Bearer " + start.key },
            },
          ),
          env,
        )
      ).status,
      200,
    );
    assert.ok(sql.prepare("SELECT COUNT(*) n FROM flyer_pages").get().n > 0);
  } finally {
    globalThis.fetch = original;
    sql.close();
  }
});

test("price kinds, percentage-only offers and ambiguous quantities are explicit and conservative", () => {
  const regular = normalizeSourceOffer(raw("x"), catalog)[0];
  assert.equal(priceBasis(regular).safe, true);
  assert.equal(comparison(regular).before, 80);
  assert.equal(comparison(regular).discount, 50);
  assert.match(comparison(regular).beforeSource, /kildens/);
  const variants = cleanOffers(
    normalizeSourceOffer(
      raw("x", {
        price: null,
        membershipPrice: 40,
        savings: null,
        membershipRelativeSavings: 30,
      }),
      catalog,
    ),
  );
  const p = emptyProfile();
  assert.equal(availableOffers(variants, p, false).length, 0);
  p.memberChains = ["meny"];
  assert.equal(availableOffers(variants, p, false).length, 1);
  const pct = normalizeSourceOffer(
    raw("pct", {
      price: null,
      savings: null,
      relativeSavings: 40,
      fromPrice: 20,
    }),
    catalog,
  )[0];
  assert.equal(comparison(pct).discount, 40);
  assert.equal(comparison(pct).before, null);
  assert.equal(offerFor("chicken", 100, cleanOffers([pct])), null);
  const uncertain = normalizeSourceOffer(
    raw("range", { unitSizeTo: 800 }),
    catalog,
  )[0];
  assert.equal(priceBasis(uncertain).safe, false);
  assert.equal(productKey(uncertain), null);
});

test("discount mode uses documented savings, while low-cost mode chooses the cheaper full packages", () => {
  const p = {
    ...emptyProfile(),
    days: 1,
    maxStores: 0,
    maxTime: 5,
    planMode: "discounts",
    customRecipes: [
      {
        id: "custom-12345678",
        title: "Kylling",
        time: 5,
        tags: [],
        tip: "",
        ingredients: [["chicken", 100]],
        steps: ["Stek kyllingen helt gjennom."],
      },
    ],
  };
  p.manualOffers = [
    {
      id: "manual-11111111",
      ingredient: "chicken",
      name: "Lav pris",
      store: "Meny",
      price: 20,
      beforePrice: 25,
      quantity: 400,
      validFrom: "2020-01-01",
      validUntil: "2099-01-01",
    },
    {
      id: "manual-22222222",
      ingredient: "chicken",
      name: "Stor rabatt",
      store: "Rema",
      price: 30,
      beforePrice: 100,
      quantity: 400,
      validFrom: "2020-01-01",
      validUntil: "2099-01-01",
    },
  ];
  p.plan = makePlan(p, [], true);
  const items = basket(p, [], true);
  assert.equal(items[0].offer.name, "Stor rabatt");
  assert.equal(advertisedBasketSaving(items).savings, 70);
  p.budget = 25;
  assert.equal(basket(p, [], true)[0].offer.name, "Lav pris");
  p.budget = 0;
  p.planMode = "offers";
  assert.equal(basket(p, [], true)[0].offer.name, "Lav pris");
});
