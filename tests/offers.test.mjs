import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  chainInfo,
  comparison,
  productKey,
  priceBasis,
} from "../dist/offers.js";
import {
  emptyProfile,
  cleanOffers,
  makePlan,
  basket,
  coverage,
} from "../dist/engine.js";
import { buildHistory, refreshOffers, readOffers } from "../worker/offers.js";
import worker from "../worker/index.js";
const offer = (extra = {}) => ({
  name: "Kyllingfilet",
  mengde: "400 g",
  price: "40,-",
  store: "Meny",
  store_label: "Meny Askim 🚗",
  store_key: "meny",
  merknad: "100,-/kilogram · spar 20,-",
  ...extra,
});
const snap = (date, products) => ({
  meta: { generated: date + "T08:00:00Z" },
  products,
});
const now = new Date("2026-10-05T12:00:00Z");
test("advertised before prices and savings have an explicit origin, without invented references", () => {
  const c = comparison(offer());
  assert.equal(c.before, 60);
  assert.equal(c.beforeSource, "Utledet fra oppgitt «spar»");
  assert.ok(Math.abs(c.discount - 100 / 3) < 0.001);
  const explicit = comparison(
    offer({ mengde: "400 g Førpris: 79,90", merknad: "" }),
  );
  assert.equal(explicit.before, 79.9);
  assert.equal(explicit.beforeSource, "Oppgitt førpris");
  const unknown = comparison(offer({ merknad: "" }));
  assert.equal(unknown.before, null);
  assert.equal(unknown.rating, "Rabatt ukjent");
  assert.equal(
    comparison(offer(), {
      mean: 50,
      min: 40,
      max: 60,
      weeks: 4,
      from: "2026-08-01",
      until: "2026-09-21",
    }).rating,
    "Godt tilbud",
  );
});
test("chain names are independent of branches and old filters normalize", () => {
  for (const value of ["Meny Mysen", "#Meny Askim 🚗", "meny"])
    assert.deepEqual(chainInfo(value), { key: "meny", label: "Meny" });
  assert.deepEqual(chainInfo("Coop Obs Slitu 🚗"), {
    key: "obs",
    label: "Obs",
  });
  assert.equal(cleanOffers([offer()])[0].store_label, "Meny");
});
test("inconsistent package and unit prices cannot enter the basket or history", () => {
  const bad = offer({
    price: "272",
    mengde: "300 g",
    merknad: "272,-/kilogram · spar 71,-",
    name: "Laks loin",
  });
  assert.equal(priceBasis(bad).safe, false);
  assert.equal(productKey(bad), null);
  assert.equal(comparison(bad).rating, "Prisgrunnlag uklart");
  const p = { ...emptyProfile(), plan: ["salmon-butter"] };
  assert.equal(
    basket(p, cleanOffers([bad]), false).find((i) => i.id === "salmon").offer,
    null,
  );
});
test("historical mean gives each observed week one vote and excludes current, old and other packs", () => {
  const current = snap("2026-10-05", [offer()]);
  const history = buildHistory(
    [
      snap("2026-09-21", [
        offer({ price: "60", merknad: "" }),
        offer({ price: "60", merknad: "" }),
      ]),
      snap("2026-09-28", [offer({ price: "80", merknad: "" })]),
      snap("2026-09-29", [offer({ price: "80", merknad: "" })]),
      snap("2026-09-14", [
        offer({ price: "10", mengde: "800 g", merknad: "" }),
      ]),
      snap("2025-01-01", [offer({ price: "1", merknad: "" })]),
      current,
    ],
    current,
    now,
  );
  const h = history["meny::" + productKey(offer())];
  assert.equal(h.mean, 70);
  assert.equal(h.weeks, 2);
  assert.equal(h.min, 60);
  assert.equal(h.until, "2026-09-28");
  assert.notEqual(
    productKey(offer({ mengde: "TINE 400 g" })),
    productKey(offer({ mengde: "Coop 400 g" })),
  );
});
test("offer mode maximizes real grocery coverage and keeps locks", () => {
  const r = (id, ingredients) => ({
    id: "custom-" + id.padStart(8, "0"),
    title: id,
    time: 5,
    tip: "",
    tags: [],
    steps: ["Lag middag."],
    ingredients: ingredients.map((id) => [id, 1]),
  });
  const low = r("11111111", ["rice", "oil", "garlic", "soy", "eggs"]),
    high = r("22222222", ["potato", "carrot", "cheese", "cucumber", "eggs"]);
  const p = {
    ...emptyProfile(),
    customRecipes: [low, high],
    planMode: "offers",
    maxStores: 0,
    days: 1,
    maxTime: 10,
    budget: 1,
  };
  p.manualOffers = high.ingredients.map(([ingredient], i) => ({
    id: "manual-" + String(i).padStart(8, "0"),
    ingredient,
    name: ingredient,
    store: "Kjede " + i,
    price: 1,
    quantity: 10,
    member: false,
    validFrom: "2020-01-01",
    validUntil: "2099-01-01",
  }));
  p.plan = makePlan(p, [], true);
  assert.deepEqual(p.plan, [high.id]);
  assert.equal(coverage(basket(p, [], true)).percent, 100);
  p.plan = [low.id];
  p.locked = [0];
  assert.deepEqual(makePlan(p, [], true), [low.id]);
  const owned = { ...p, pantry: { rice: 1 }, manualOffers: [] };
  assert.equal(coverage(basket(owned, [], true)).total, 4);
});
test("all-chain mode can use more than eight offer chains", () => {
  const ids = [
    "rice",
    "oil",
    "garlic",
    "soy",
    "eggs",
    "carrot",
    "potato",
    "cheese",
    "cucumber",
    "honey",
  ];
  const p = {
    ...emptyProfile(),
    planMode: "offers",
    maxStores: 0,
    customRecipes: [
      {
        id: "custom-12345678",
        title: "Mange råvarer",
        time: 5,
        tip: "",
        tags: [],
        steps: ["Lag maten."],
        ingredients: ids.map((id) => [id, 1]),
      },
    ],
    plan: ["custom-12345678"],
  };
  p.manualOffers = ids.map((ingredient, i) => ({
    id: "manual-" + String(i).padStart(8, "0"),
    ingredient,
    name: ingredient,
    store: "Kjede " + i,
    price: 1,
    quantity: 10,
    member: false,
    validFrom: "2020-01-01",
    validUntil: "2099-01-01",
  }));
  assert.equal(coverage(basket(p, [], true)).offered, 10);
});
test("repeat option fills a week and locks only the selected occurrence", () => {
  const high = {
    id: "custom-aaaaaaaa",
    title: "Enkel tilbudsmiddag",
    time: 5,
    tip: "",
    tags: [],
    steps: ["Lag middag."],
    ingredients: [
      ["eggs", 1],
      ["potato", 100],
    ],
  };
  const low = {
    ...high,
    id: "custom-bbbbbbbb",
    ingredients: [
      ["eggs", 1],
      ["rice", 1000],
    ],
  };
  const p = {
    ...emptyProfile(),
    days: 7,
    maxTime: 10,
    maxStores: 0,
    planMode: "offers",
    allowRepeats: true,
    customRecipes: [high, low],
    plan: Array(7).fill(high.id),
    locked: [0],
    manualOffers: ["eggs", "potato", "rice"].map((ingredient, i) => ({
      id: "manual-" + String(i).padStart(8, "0"),
      ingredient,
      name: ingredient,
      store: "Meny",
      price: ingredient === "potato" ? 100 : 1,
      quantity: ingredient === "rice" ? 1000 : 100,
      member: false,
      validFrom: "2020-01-01",
      validUntil: "2099-01-01",
    })),
  };
  const ids = makePlan(p, [], true);
  assert.equal(ids.length, 7);
  assert.equal(ids[0], high.id);
  assert.ok(ids.slice(1).every((id) => id === low.id));
  p.customRecipes = [high];
  p.plan = [];
  p.locked = [];
  assert.deepEqual(makePlan(p, [], true), Array(7).fill(high.id));
  p.allowRepeats = false;
  assert.deepEqual(makePlan(p, [], true), [high.id]);
});
test("authenticated collection persists archives, deduplicates weeks and survives a failed source", async () => {
  const sql = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sql.exec(
      readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
    );
  const statement = (query, values = []) => ({
    async run() {
      return { meta: { changes: sql.prepare(query).run(...values).changes } };
    },
    async first() {
      return sql.prepare(query).get(...values) || null;
    },
    async all() {
      return { results: sql.prepare(query).all(...values) };
    },
    bind(...args) {
      return statement(query, args);
    },
  });
  const env = {
    DB: {
      prepare: statement,
      async batch(items) {
        const results = [];
        for (const item of items) results.push(await item.run());
        return results;
      },
    },
    OFFERS_UPDATE_KEY: "test-only-key",
  };
  const actualFetch = globalThis.fetch;
  let failArchiveOnce = true;
  let additionalArchive = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("data_uke40") && failArchiveOnce) {
      failArchiveOnce = false;
      return new Response("Archive unavailable", { status: 503 });
    }
    return new Response(
      JSON.stringify(
        String(url).includes("api.github")
          ? [
              { name: "data_uke39.json" },
              { name: "data_uke40.json" },
              ...(additionalArchive ? [{ name: "data_uke38.json" }] : []),
            ]
          : String(url).includes("data_uke39")
            ? snap("2026-09-21", [offer({ price: "60", merknad: "" })])
            : String(url).includes("data_uke40")
              ? snap("2026-09-28", [offer({ price: "80", merknad: "" })])
              : String(url).includes("data_uke38")
                ? snap("2026-09-14", [offer({ price: "70", merknad: "" })])
                : snap("2026-10-05", [offer()]),
      ),
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    assert.equal(
      (
        await worker.fetch(
          new Request("https://test.local/api/offers/refresh", {
            method: "POST",
          }),
          env,
        )
      ).status,
      401,
    );
    const result = await refreshOffers(env, now);
    assert.equal(result.weeks, 2);
    assert.equal(result.archiveErrors, 1);
    assert.equal((await refreshOffers(env, now)).weeks, 3);
    assert.equal((await refreshOffers(env, now)).weeks, 3);
    const authorized = await worker.fetch(
      new Request("https://test.local/api/offers/refresh", {
        method: "POST",
        headers: { authorization: "Bearer test-only-key" },
      }),
      env,
    );
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).updated, true);
    const read = await readOffers(env, null, false, now);
    assert.equal(read.products[0].history.mean, 70);
    assert.equal(read.products[0].history.weeks, 2);
    assert.equal(read.meta.chains[0].label, "Meny");
    additionalArchive = true;
    const get = (key) =>
      worker.fetch(
        new Request("https://test.local/api/offers?refresh=1", {
          headers: key ? { authorization: "Bearer " + key } : {},
        }),
        env,
      );
    assert.equal((await (await get()).json()).meta.historyWeeks, 3);
    assert.equal(
      (await (await get("0".repeat(48))).json()).meta.historyWeeks,
      3,
    );
    const created = await worker.fetch(
      new Request("https://test.local/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyProfile("Historikk-test")),
      }),
      env,
    );
    assert.equal(created.status, 201);
    const key = (await created.json()).key;
    const collected = await get(key);
    assert.equal(collected.status, 200);
    const recorded = await collected.json();
    assert.equal(recorded.meta.historyWeeks, 4);
    assert.equal(recorded.meta.historyError, false);
    assert.equal(recorded.products[0].history.weeks, 3);
    globalThis.fetch = async () => {
      throw Error("Offline");
    };
    await assert.rejects(refreshOffers(env, now));
    assert.equal(
      sql.prepare("SELECT COUNT(*) AS n FROM offer_snapshots").get().n,
      4,
    );
    const cached = await readOffers(env, null, true, now);
    assert.equal(cached.meta.sourceError, true);
    assert.equal(cached.products[0].history.mean, 70);
  } finally {
    globalThis.fetch = actualFetch;
    sql.close();
  }
});
