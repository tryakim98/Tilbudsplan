import {
  chainInfo,
  isoPeriod,
  productKey,
  parsePrice,
  priceBasis,
} from "../dist/offers.js";
import { localDate } from "../dist/model.js";
import { buildHistory } from "./offers.js";

const SITE = "https://etilbudsavis.no/";
const API = "https://squid-api.tjek.com/v2/";
const LIMIT = 100;
const BATCH = 4;
const day = 86400000;
const keyHash = async (key) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");

async function source(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "Tilbudsplan/1.0",
      Accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok)
    throw new Error(`Tilbudskilden svarte ${r.status}. Prøv igjen senere.`);
  const body = await r.text();
  if (body.length > 8000000)
    throw new Error(
      "Kilden returnerte mer data enn hentingen kan behandle. Ingen komplett dekning er bekreftet.",
    );
  return body;
}

// The public site's own read protocol. No sign-in, customer key or arbitrary URL.
export async function readSourceData(queries) {
  const keys = queries.map((q) => btoa(JSON.stringify(q)));
  const raw = await source(SITE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: keys }),
  });
  const lines = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return keys.map((key) => {
    const item = lines.find((l) => l.key === key);
    return item?.status === "success"
      ? { value: item.value }
      : { error: item?.error?.message || "Kilden mangler et svar" };
  });
}

export async function discoverCatalogs(now = new Date()) {
  const [answer] = await readSourceData([["businesses", {}]]);
  if (answer.error || !Array.isArray(answer.value))
    throw new Error(
      "Kjederegisteret kunne ikke hentes. Ingen ukeplan er laget.",
    );
  const businesses = answer.value.filter(
    (b) =>
      b.countryCode === "NO" &&
      b.primaryCategoryId === "groceries" &&
      b.isEnabled,
  );
  if (!businesses.length)
    throw new Error("Kilden returnerte ingen norske dagligvarekjeder.");
  const ids = businesses.map((b) => b.publicId);
  const catalogs = new Map();
  const signatures = new Set();
  // A short page is not proof of the end: some source interfaces filter rows.
  // Always fetch the next offset, and require an empty terminal page.
  for (let offset = 0; ; offset += LIMIT) {
    const url = new URL("catalogs", API);
    url.search = new URLSearchParams({
      dealer_ids: ids.join(","),
      limit: String(LIMIT),
      offset: String(offset),
    });
    const page = JSON.parse(await source(url));
    if (!Array.isArray(page))
      throw new Error("Avisregisteret har et ukjent format.");
    if (!page.length) break;
    const signature = page
      .map((c) => c.id)
      .sort()
      .join("|");
    if (signatures.has(signature) || offset >= 10000)
      throw new Error(
        "Aviskilden fullfører ikke pagineringen. Innsamlingen er stoppet uten å godkjenne dekningen.",
      );
    signatures.add(signature);
    for (const c of page) if (ids.includes(c.dealer_id)) catalogs.set(c.id, c);
  }
  const [fronts] = await readSourceData([
    ["fronts", { businessIds: ids, hideInactive: false }],
  ]);
  if (fronts.error || !Array.isArray(fronts.value))
    throw new Error("Kontrollen mot tilbudsavisenes forside feilet.");
  const missing = fronts.value.flatMap((f) =>
    (f.publications || [])
      .filter((p) => !catalogs.has(p.id))
      .map((p) => ({ p, b: f.business })),
  );
  for (let i = 0; i < missing.length; i += BATCH) {
    const answers = await Promise.allSettled(
      missing.slice(i, i + BATCH).map(async ({ p, b }) => {
        const c = JSON.parse(
          await source(new URL("catalogs/" + encodeURIComponent(p.id), API)),
        );
        if (!c || c.id !== p.id || c.dealer_id !== b.publicId)
          throw new Error("Avismetadata stemmer ikke");
        return c;
      }),
    );
    answers.forEach((a, j) => {
      if (a.status === "fulfilled") catalogs.set(a.value.id, a.value);
      else {
        const { p, b } = missing[i + j];
        catalogs.set(p.id, {
          id: p.id,
          dealer_id: b.publicId,
          label: p.label,
          run_from: p.validFrom,
          run_till: p.validUntil,
          offer_count: null,
          page_count: null,
        });
      }
    });
  }
  const chains = businesses.map((b) => ({
    ...chainInfo(b.name),
    sourceId: b.publicId,
    slug: b.slugs?.[0] || b.name,
  }));
  const active = [...catalogs.values()].filter(
    (c) =>
      (!c.run_till || new Date(c.run_till) >= now) &&
      (!c.publish || new Date(c.publish) <= now),
  );
  if (!active.length)
    throw new Error("Ingen publiserte, gyldige tilbudsaviser finnes i kilden.");
  return {
    chains,
    catalogs: active.map((c) => {
      const chain = chains.find((b) => b.sourceId === c.dealer_id);
      return {
        id: c.id,
        chain: chain.key,
        sourceId: chain.sourceId,
        label: chain.label,
        slug: chain.slug,
        title: c.label || "Tilbudsavis",
        expected: c.offer_count ?? null,
        pages: c.page_count ?? null,
        validFrom: c.run_from,
        validUntil: c.run_till,
        regional: c.all_stores !== true,
        phase: "modern",
        offset: 0,
        count: 0,
        ids: [],
        signatures: [],
        done: false,
        error: null,
      };
    }),
  };
}

function exactPack(o) {
  const units = {
    kg: [1000, "g"],
    g: [1, "g"],
    l: [1000, "ml"],
    dl: [100, "ml"],
    ml: [1, "ml"],
    pcs: [1, "stk"],
    stk: [1, "stk"],
  };
  const unit = units[o.unitSymbol];
  const size = o.unitSizeFrom,
    count = o.pieceCountFrom;
  if (
    !unit ||
    !(size > 0) ||
    !(count > 0) ||
    size !== o.unitSizeTo ||
    count !== o.pieceCountTo ||
    (o.pieceCountMin && o.pieceCountMin !== count) ||
    (o.pieceCountMax && o.pieceCountMax !== count)
  )
    return null;
  // Generic "one piece" must not turn a tray of eggs into one egg.
  if (unit[1] === "stk") {
    const stated = (o.name + " " + (o.description || "")).match(
      /\b(\d+)\s*[- ]?\s*(?:stk|pk|pakning)\b/i,
    );
    if (stated) return { quantity: Number(stated[1]), unit: "stk" };
  }
  return { quantity: size * count * unit[0], unit: unit[1] };
}
function date(s) {
  const d = new Date(s);
  return Number.isFinite(d.valueOf()) ? localDate(d) : null;
}

export function normalizeSourceOffer(o, c) {
  if (
    !o ||
    typeof o.publicId !== "string" ||
    typeof o.name !== "string" ||
    o.publicationPublicId !== c.id ||
    o.businessPublicId !== c.sourceId
  )
    throw new Error(
      "Kilden returnerte et tilbud fra feil avis eller uten ID/navn.",
    );
  const pack = exactPack(o);
  const common = {
    sourceId: o.publicId,
    name: o.name.slice(0, 500),
    store: c.label,
    store_key: c.chain,
    store_label: c.label,
    category: o.departmentSlug || "Uten kategori",
    mengde:
      o.description ||
      (pack ? `${pack.quantity} ${pack.unit}` : "Mengde ikke oppgitt"),
    structured: true,
    sourcePack: o.pieceCountGet > 0 || o.pieceCountGetFor > 0 ? null : pack,
    currency: o.currencyCode,
    unitPrice: o.unitPrice,
    baseUnit: o.baseUnit,
    validFrom: date(o.validFrom || c.validFrom),
    validUntil: date(o.validUntil || c.validUntil),
    sourceUrl:
      SITE +
      encodeURIComponent(c.slug) +
      "?publication=" +
      encodeURIComponent(c.id) +
      "&offer=" +
      encodeURIComponent(o.publicId),
    publicationId: c.id,
    publicationTitle: c.title,
    regional: c.regional,
    merknad: o.description || "",
    fromPrice: parsePrice(o.fromPrice),
    advertisedDiscount:
      o.relativeSavings > 0 && o.relativeSavings <= 100
        ? o.relativeSavings
        : null,
  };
  const variants = [];
  const regular = parsePrice(o.price);
  if (regular)
    variants.push({
      ...common,
      id: "etil-" + o.publicId,
      price: regular,
      accessKind: "regular",
      beforePrice: o.savings > 0 ? regular + o.savings : null,
      beforeOrigin: o.savings > 0 ? "Utledet fra kildens oppgitte «spar»" : "",
    });
  if (parsePrice(o.membershipPrice))
    variants.push({
      ...common,
      id: "etil-" + o.publicId + "-member",
      price: o.membershipPrice,
      accessKind: "member",
      advertisedDiscount:
        o.membershipRelativeSavings > 0 && o.membershipRelativeSavings <= 100
          ? o.membershipRelativeSavings
          : null,
      beforePrice: null,
    });
  if (parsePrice(o.appPrice))
    variants.push({
      ...common,
      id: "etil-" + o.publicId + "-app",
      price: o.appPrice,
      accessKind: "app",
      advertisedDiscount: null,
      beforePrice: null,
    });
  if (!variants.length)
    variants.push({
      ...common,
      id: "etil-" + o.publicId,
      price: null,
      accessKind: "unpriced",
    });
  return variants;
}

function legacyOffer(o, c) {
  if (o.catalog_id !== c.id || o.dealer_id !== c.sourceId)
    throw new Error("Avisdataene tilhører feil avis eller kjede.");
  const pricing = o.pricing || {},
    q = o.quantity || {};
  const quote = String(o.description || "").match(
    /(\d+(?:[.,]\d+)?)\s*[,.-]*\s*(?:\/|pr\.?\s*)(kg|kilogram|l|liter|stk|piece)\b/i,
  );
  const products = normalizeSourceOffer(
    {
      publicId: o.id,
      name: o.heading,
      description: o.description,
      publicationPublicId: o.catalog_id,
      businessPublicId: o.dealer_id,
      currencyCode: pricing.currency,
      price: pricing.price,
      savings:
        pricing.pre_price > pricing.price && pricing.price > 0
          ? pricing.pre_price - pricing.price
          : null,
      unitSymbol: q.unit?.symbol,
      unitSizeFrom: q.size?.from,
      unitSizeTo: q.size?.to,
      pieceCountFrom: q.pieces?.from,
      pieceCountTo: q.pieces?.to,
      pieceCountMin: q.pieces?.min,
      pieceCountMax: q.pieces?.max,
      validFrom: o.run_from,
      validUntil: o.run_till,
      unitPrice: quote ? Number(quote[1].replace(",", ".")) : null,
      baseUnit: quote
        ? /kg|kilogram/i.test(quote[2])
          ? "kilogram"
          : /^(?:l|liter)$/i.test(quote[2])
            ? "liter"
            : "piece"
        : null,
    },
    c,
  );
  for (const product of products) {
    product.sourceInterface = "avisdata";
    if (pricing.pre_price > 0)
      product.beforeOrigin = "Oppgitt førpris i avisdataene";
    if (/\b(?<!ikke[- ])medlem|kundeklubb|trumf/i.test(o.description || "")) {
      product.accessKind = "member";
      product.id += "-member";
    } else if (/\bapp(?:pris|en)?\b/i.test(o.description || "")) {
      product.accessKind = "app";
      product.id += "-app";
    }
  }
  return products;
}

async function sourcePages(todo) {
  const modern = todo.filter((c) => c.phase === "modern");
  const tasks = [];
  if (modern.length)
    tasks.push({
      catalogs: modern,
      promise: readSourceData(
        modern.map((c) => [
          "offers",
          {
            publicationIds: [c.id],
            sources: ["publication"],
            pagination: { limit: LIMIT, offset: c.offset },
          },
        ]),
      ),
    });
  for (const c of todo.filter((c) => c.phase === "legacy")) {
    const url = new URL("offers", API);
    url.search = new URLSearchParams({
      catalog_id: c.id,
      limit: String(LIMIT),
      offset: String(c.offset),
    });
    tasks.push({
      catalogs: [c],
      promise: source(url).then((raw) => [
        {
          value: {
            data: JSON.parse(raw),
            metadata: { pagination: { limit: LIMIT, offset: c.offset } },
          },
        },
      ]),
    });
  }
  const result = new Map();
  const answers = await Promise.allSettled(tasks.map((t) => t.promise));
  answers.forEach((a, i) =>
    tasks[i].catalogs.forEach((c, j) =>
      result.set(
        c.id,
        a.status === "fulfilled" ? a.value[j] : { error: a.reason.message },
      ),
    ),
  );
  return todo.map((c) => result.get(c.id));
}

export function collectionCoverage(state) {
  const catalogs = state.catalogs.map((c) => ({
    id: c.id,
    chain: c.label,
    title: c.title,
    expected: c.expected,
    received: c.count,
    done: c.done,
    error: c.error,
    missing: c.expected === null ? null : Math.max(0, c.expected - c.count),
    unstructured: c.done && c.count === 0,
    regional: c.regional,
  }));
  const done = catalogs.filter((c) => c.done).length;
  const gaps = catalogs.filter(
    (c) =>
      c.error ||
      c.unstructured ||
      c.expected === null ||
      c.received < c.expected,
  );
  return {
    complete: done === catalogs.length && gaps.length === 0,
    surveyedChains: state.chains.length,
    chainsWithFlyers: new Set(state.catalogs.map((c) => c.chain)).size,
    catalogsTotal: catalogs.length,
    catalogsDone: done,
    offersFetched: catalogs.reduce((n, c) => n + c.received, 0),
    missing: catalogs.reduce((n, c) => n + (c.missing || 0), 0),
    gaps: gaps.length,
    cachedCatalogs: state.catalogs.filter((c) => c.cached).length,
    catalogs,
    scope:
      "Publiserte tilbudsaviser hos norske dagligvarekjeder i eTilbudsavis. Alle regionale varianter hentes. Kilden kan mangle trykte tilbud eller hele kjeder.",
  };
}

export async function startCollection(env, now = new Date(), force = false) {
  const state = await discoverCatalogs(now);
  const key = [...crypto.getRandomValues(new Uint8Array(24))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const id = crypto.randomUUID();
  const copies = [];
  if (!force) {
    const cutoff = new Date(now.valueOf() - 15 * 60000).toISOString();
    const cached = await env.DB.prepare(
      "SELECT id,state FROM offer_runs WHERE completed_at>=? AND status IN ('complete','incomplete') ORDER BY completed_at DESC LIMIT 1",
    )
      .bind(cutoff)
      .first();
    if (cached) {
      const previous = JSON.parse(cached.state);
      for (let i = 0; i < state.catalogs.length; i++) {
        const c = state.catalogs[i],
          prior = previous.catalogs.find((p) => p.id === c.id);
        if (
          !prior?.done ||
          prior.error ||
          !prior.fetchedAt ||
          prior.fetchedAt < cutoff ||
          localDate(new Date(prior.fetchedAt)) !== localDate(now) ||
          ["sourceId", "expected", "validFrom", "validUntil"].some(
            (k) => c[k] !== prior[k],
          )
        )
          continue;
        state.catalogs[i] = { ...prior, cached: true };
        copies.push(
          env.DB.prepare(
            "INSERT INTO flyer_pages (run_id,catalog_id,page_offset,payload) SELECT ?,catalog_id,page_offset,payload FROM flyer_pages WHERE run_id=? AND catalog_id=?",
          ).bind(id, cached.id, c.id),
        );
      }
    }
  }
  const coverage = collectionCoverage(state);
  const ended = coverage.catalogsDone === coverage.catalogsTotal;
  const status = ended
    ? coverage.complete
      ? "complete"
      : "incomplete"
    : "collecting";
  await env.DB.prepare(
    "INSERT INTO offer_runs (id,key_hash,started_at,completed_at,status,state,lease_until) VALUES (?,?,?,?,?,?,NULL)",
  )
    .bind(
      id,
      await keyHash(key),
      now.toISOString(),
      null,
      "collecting",
      JSON.stringify(state),
    )
    .run();
  for (let i = 0; i < copies.length; i += 40)
    await env.DB.batch(copies.slice(i, i + 40));
  if (ended)
    await env.DB.prepare(
      "UPDATE offer_runs SET status=?,completed_at=? WHERE id=?",
    )
      .bind(status, now.toISOString(), id)
      .run();
  return { id, key, status, coverage };
}
export async function authorizedRun(env, id, key) {
  if (!/^[a-f0-9]{48}$/.test(key || "")) return null;
  return env.DB.prepare("SELECT * FROM offer_runs WHERE id=? AND key_hash=?")
    .bind(id, await keyHash(key))
    .first();
}

export async function stepCollection(env, run, now = new Date()) {
  if (run.status !== "collecting")
    return {
      id: run.id,
      status: run.status,
      coverage: collectionCoverage(JSON.parse(run.state)),
    };
  const lease = await env.DB.prepare(
    "UPDATE offer_runs SET lease_until=? WHERE id=? AND status='collecting' AND (lease_until IS NULL OR lease_until<?) AND state=?",
  )
    .bind(
      new Date(now.valueOf() + 45000).toISOString(),
      run.id,
      now.toISOString(),
      run.state,
    )
    .run();
  if (!lease.meta.changes) return { id: run.id, status: "busy" };
  const state = JSON.parse(run.state);
  try {
    const waiting = state.catalogs.filter((c) => !c.done);
    const todo = [
      ...waiting.filter((c) => c.phase === "modern").slice(0, 12),
      ...waiting
        .filter((c) => c.phase === "legacy")
        .slice(0, waiting.some((c) => c.phase === "modern") ? 3 : BATCH),
    ];
    const answers = await sourcePages(todo);
    const writes = [];
    const observations = new Map();
    const period = isoPeriod(now.toISOString());
    for (let i = 0; i < todo.length; i++) {
      const c = todo[i],
        a = answers[i];
      try {
        if (a.error) throw new Error(a.error);
        const page = a.value?.data;
        const pagination = a.value?.metadata?.pagination;
        if (
          !Array.isArray(page) ||
          pagination?.offset !== c.offset ||
          pagination?.limit !== LIMIT
        )
          throw new Error("Kilden bekreftet ikke riktig tilbudsside.");
        if (page.length > LIMIT)
          throw new Error(
            "Kilden returnerte flere varer enn forventet per side.",
          );
        if (!page.length) {
          if (
            c.phase === "modern" &&
            !(c.expected > 0 && c.count >= c.expected)
          ) {
            c.phase = "legacy";
            c.offset = 0;
            c.signatures = [];
          } else {
            c.done = true;
            c.fetchedAt = now.toISOString();
          }
          continue;
        }
        const legacy = c.phase === "legacy";
        const signature = page
          .map((o) => (legacy ? o.id : o.publicId))
          .sort()
          .join("|");
        if (c.signatures.includes(signature) || c.offset >= 10000)
          throw new Error(
            "Tilbudspagineringen gjentar seg eller overskrider kapasiteten. Dekningen er ikke bekreftet.",
          );
        c.signatures.push(signature);
        const products = page.flatMap((o) =>
          legacy ? legacyOffer(o, c) : normalizeSourceOffer(o, c),
        );
        const ids = new Set(c.ids);
        page.forEach((o) => ids.add(legacy ? o.id : o.publicId));
        c.ids = [...ids];
        c.count = ids.size;
        writes.push(
          env.DB.prepare(
            "INSERT OR REPLACE INTO flyer_pages (run_id,catalog_id,page_offset,payload) VALUES (?,?,?,?)",
          ).bind(
            run.id,
            c.id,
            c.offset + (legacy ? 100000 : 0),
            JSON.stringify(products),
          ),
        );
        for (const o of products) {
          const product = productKey(o),
            price = parsePrice(o.price);
          if (product && price)
            observations.set(
              JSON.stringify([period, c.chain, product, price]),
              [period, c.chain, product, price, localDate(now)],
            );
        }
        c.offset += LIMIT;
      } catch (error) {
        c.error = c.error ? c.error + " · " + error.message : error.message;
        if (c.phase === "modern") {
          c.phase = "legacy";
          c.offset = 0;
          c.signatures = [];
        } else {
          c.done = true;
          c.fetchedAt = now.toISOString();
        }
      }
    }
    const prices = [...observations.values()];
    // At most 100 bound parameters per D1 statement; each observation uses five.
    for (let i = 0; i < prices.length; i += 20) {
      const batch = prices.slice(i, i + 20);
      writes.push(
        env.DB.prepare(
          "INSERT INTO flyer_prices (period,chain_key,product_key,price,observed_on) VALUES " +
            batch.map(() => "(?,?,?,?,?)").join(",") +
            " ON CONFLICT(period,chain_key,product_key,price) DO UPDATE SET observed_on=MIN(flyer_prices.observed_on,excluded.observed_on)",
        ).bind(...batch.flat()),
      );
    }
    for (let i = 0; i < writes.length; i += 40)
      await env.DB.batch(writes.slice(i, i + 40));
    const coverage = collectionCoverage(state);
    const ended = coverage.catalogsDone === coverage.catalogsTotal;
    const status = ended
      ? coverage.complete
        ? "complete"
        : "incomplete"
      : "collecting";
    await env.DB.prepare(
      "UPDATE offer_runs SET state=?,status=?,completed_at=?,lease_until=NULL WHERE id=?",
    )
      .bind(
        JSON.stringify(state),
        status,
        ended ? now.toISOString() : null,
        run.id,
      )
      .run();
    if (ended) {
      const old = new Date(now.valueOf() - 7 * day).toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM flyer_pages WHERE run_id IN (SELECT id FROM offer_runs WHERE started_at<? AND id<>?)",
        ).bind(old, run.id),
        env.DB.prepare(
          "DELETE FROM offer_runs WHERE started_at<? AND id<>?",
        ).bind(old, run.id),
        env.DB.prepare("DELETE FROM flyer_prices WHERE observed_on<?").bind(
          new Date(now.valueOf() - 366 * day).toISOString().slice(0, 10),
        ),
      ]);
    }
    return { id: run.id, status, coverage };
  } catch (error) {
    await env.DB.prepare("UPDATE offer_runs SET lease_until=NULL WHERE id=?")
      .bind(run.id)
      .run();
    throw error;
  }
}

export async function collectionResult(env, run, now = new Date()) {
  if (run.status === "collecting")
    return {
      id: run.id,
      status: run.status,
      coverage: collectionCoverage(JSON.parse(run.state)),
    };
  const state = JSON.parse(run.state);
  const rows = await env.DB.prepare(
    "SELECT payload FROM flyer_pages WHERE run_id=? ORDER BY catalog_id,page_offset",
  )
    .bind(run.id)
    .all();
  const unique = new Map();
  const savedIds = new Map();
  for (const row of rows.results)
    for (const o of JSON.parse(row.payload)) {
      if (!savedIds.has(o.publicationId))
        savedIds.set(o.publicationId, new Set());
      savedIds.get(o.publicationId).add(o.sourceId);
      const previous = unique.get(o.id);
      if (!previous) unique.set(o.id, o);
      else if (
        !previous.beforePrice &&
        o.beforePrice &&
        previous.price === o.price &&
        previous.accessKind === o.accessKind &&
        priceBasis(o).safe &&
        priceBasis(previous).safe &&
        productKey(previous) === productKey(o)
      ) {
        previous.beforePrice = o.beforePrice;
        previous.beforeOrigin = o.beforeOrigin;
      }
    }
  for (const c of state.catalogs) {
    const saved = savedIds.get(c.id)?.size || 0;
    if (saved !== c.count) {
      c.error =
        "Lagrede tilbud stemmer ikke med innsamlingen. Hent avisene på nytt.";
      c.count = saved;
    }
  }
  const coverage = collectionCoverage(state);
  const products = [...unique.values()];
  const cutoff = new Date(now.valueOf() - 365 * day).toISOString().slice(0, 10);
  const [old, observed, periods] = await Promise.all([
    env.DB.prepare(
      "SELECT payload FROM offer_snapshots WHERE generated>=? ORDER BY generated DESC LIMIT 54",
    )
      .bind(cutoff)
      .all(),
    env.DB.prepare(
      "SELECT chain_key,product_key,AVG(week_mean) AS mean,MIN(week_min) AS min,MAX(week_max) AS max,COUNT(*) AS weeks,MIN(date) AS earliest,MAX(date) AS latest FROM (SELECT period,chain_key,product_key,AVG(price) AS week_mean,MIN(price) AS week_min,MAX(price) AS week_max,MIN(observed_on) AS date FROM flyer_prices WHERE observed_on>=? AND period<>? GROUP BY period,chain_key,product_key) GROUP BY chain_key,product_key",
    )
      .bind(cutoff, isoPeriod(run.started_at))
      .all(),
    env.DB.prepare(
      "SELECT period,MIN(observed_on) AS date FROM flyer_prices WHERE observed_on>=? GROUP BY period",
    )
      .bind(cutoff)
      .all(),
  ]);
  const snapshots = old.results.map((r) => JSON.parse(r.payload));
  const current = { meta: { generated: run.started_at }, products: [] };
  const history = buildHistory(snapshots, current, now);
  for (const r of observed.results)
    history[r.chain_key + "::" + r.product_key] = {
      mean: r.mean,
      min: r.min,
      max: r.max,
      weeks: r.weeks,
      from: r.earliest,
      until: r.latest,
    };
  for (const o of products) {
    const h = history[chainInfo(o).key + "::" + productKey(o)];
    if (h) o.history = h;
  }
  const historyPeriods = new Set([
    ...snapshots.map((d) => isoPeriod(d.meta.generated)),
    ...periods.results.map((r) => r.period),
  ]);
  const dates = [
    ...snapshots.map((d) => d.meta.generated),
    ...periods.results.map((r) => r.date),
  ].sort();
  return {
    id: run.id,
    status: coverage.complete ? "complete" : "incomplete",
    meta: {
      generated: state.catalogs
        .map((c) => c.fetchedAt || run.started_at)
        .sort()[0],
      collectionStarted: run.started_at,
      collectionCompleted: run.completed_at,
      week: isoPeriod(run.started_at)?.split("W")[1],
      source: "eTilbudsavis",
      chains: state.chains,
      coverage,
      historyWeeks: historyPeriods.size,
      historyFrom: dates[0] || null,
    },
    products,
  };
}

export async function lastCollection(env, now = new Date()) {
  const run = await env.DB.prepare(
    "SELECT * FROM offer_runs WHERE status IN ('complete','incomplete') ORDER BY completed_at DESC LIMIT 1",
  ).first();
  return run ? collectionResult(env, run, now) : null;
}
