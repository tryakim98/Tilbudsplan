import {
  chainInfo,
  isoPeriod,
  productKey,
  parsePrice,
  priceBasis,
} from "../dist/offers.js";
import { localDate } from "../dist/model.js";
import { buildHistory } from "./offers.js";
import { areaForStore, LOCAL_AREA_LABEL } from "../dist/locality.js";

const SITE = "https://etilbudsavis.no/";
const API = "https://squid-api.tjek.com/v2/";
const LIMIT = 100;
const BATCH = 4;
const COLLECTION_VERSION = 4;
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

const STORE_SEARCHES = [
  { area: "fredrikstad", latitude: 59.22, longitude: 10.94 },
  { area: "sarpsborg", latitude: 59.28, longitude: 11.11 },
  { area: "mysen", latitude: 59.55, longitude: 11.325 },
];
const STORE_CACHE_MS = 24 * 60 * 60000;

function localStore(s, chain) {
  const area = areaForStore(s);
  if (
    !area ||
    typeof s.id !== "string" ||
    !s.id.trim() ||
    s.dealer_id !== chain.sourceId
  )
    return null;
  return {
    id: s.id,
    area,
    sourceId: chain.sourceId,
    name: String(s.name || chain.label + " " + s.city).slice(0, 150),
    city: s.city.slice(0, 80),
    street: String(s.street || "").slice(0, 150),
    postcode: String(s.zip_code || "").slice(0, 10),
  };
}
function foodCatalog(c) {
  const categories = c.category_ids || [];
  return (
    c.offer_count !== 0 &&
    (!categories.length || categories.includes("groceries")) &&
    !/\b(?:bygg|byggevarer|hagemøbler|elektronikk|oppskriftshefte|oppskriftsbok)\b/i.test(
      c.label || "",
    )
  );
}

export async function discoverCatalogs(now = new Date(), storeCache = null) {
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
  const chains = businesses.map((b) => ({
    ...chainInfo(b.name),
    sourceId: b.publicId,
    slug: b.slugs?.[0] || b.name,
  }));
  const byId = new Map(chains.map((c) => [c.sourceId, c]));
  const warnings = [];
  let stores, storeIndexAt;
  const cacheDate = new Date(storeCache?.storeIndexAt);
  if (
    storeCache?.version === COLLECTION_VERSION &&
    cacheDate <= now &&
    now - cacheDate < STORE_CACHE_MS &&
    Array.isArray(storeCache.storeIndex) &&
    storeCache.storeIndex.length &&
    !storeCache.discoveryWarnings?.length
  ) {
    stores = storeCache.storeIndex.filter(
      (s) =>
        typeof s.id === "string" &&
        s.id.trim() &&
        byId.has(s.sourceId) &&
        areaForStore({ city: s.city, country: { id: "NO" } }) === s.area,
    );
    storeIndexAt = storeCache.storeIndexAt;
  }
  if (!stores?.length) {
    // Three bounded nearby searches replace the nationwide flyer/store scan.
    // Country, grocery chain and exact postal town are checked independently.
    const replies = await Promise.allSettled(
      STORE_SEARCHES.map(async (place) => {
        const url = new URL("stores", API);
        url.search = new URLSearchParams({
          dealer_ids: [...byId.keys()].join(","),
          r_lat: String(place.latitude),
          r_lng: String(place.longitude),
          limit: String(LIMIT),
          offset: "0",
        });
        const rows = JSON.parse(await source(url));
        if (!Array.isArray(rows) || rows.length > LIMIT)
          throw new Error("Lokalt butikksøk svarte med et ukjent format.");
        return rows.flatMap((s) => {
          const chain = byId.get(s.dealer_id);
          const local = chain && localStore(s, chain);
          return local ? [local] : [];
        });
      }),
    );
    const indexed = new Map();
    replies.forEach((reply, i) => {
      if (reply.status === "fulfilled")
        reply.value.forEach((s) => indexed.set(s.id, s));
      else
        warnings.push({
          area: STORE_SEARCHES[i].area,
          message:
            "Butikker i området kunne ikke søkes opp: " + reply.reason.message,
        });
    });
    stores = [...indexed.values()];
    storeIndexAt = now.toISOString();
  }
  if (!stores.length)
    throw new Error(
      "Ingen lokale dagligvarebutikker kunne kontrolleres. Den eksisterende planen er beholdt.",
    );
  const localIds = new Set(stores.map((s) => s.sourceId));
  const catalogs = new Map(),
    signatures = new Set();
  let skippedCatalogs = 0;
  // The API filters on the actual local store IDs BEFORE returning flyers.
  // No national fronts lookup and no nationwide fallback are performed.
  for (let offset = 0; ; offset += LIMIT) {
    const url = new URL("catalogs", API);
    url.search = new URLSearchParams({
      store_ids: stores.map((s) => s.id).join(","),
      dealer_ids: [...localIds].join(","),
      limit: String(LIMIT),
      offset: String(offset),
    });
    const page = JSON.parse(await source(url));
    if (!Array.isArray(page) || page.length > LIMIT)
      throw new Error("Det lokale avisregisteret har et ukjent format.");
    if (!page.length) break;
    const signature = page
      .map((c) => c.id)
      .sort()
      .join("|");
    if (signatures.has(signature) || offset >= 10000)
      throw new Error(
        "Det lokale avisregisteret gjentar sider. Hentingen er stoppet.",
      );
    signatures.add(signature);
    for (const c of page) {
      if (
        !localIds.has(c.dealer_id) ||
        !foodCatalog(c) ||
        (c.run_from && new Date(c.run_from) > now) ||
        (c.run_till && new Date(c.run_till) < now) ||
        (c.publish && new Date(c.publish) > now)
      ) {
        skippedCatalogs++;
        continue;
      }
      if (typeof c.id !== "string" || !c.id.trim())
        throw new Error("Avisen mangler en sikker ID.");
      catalogs.set(c.id, c);
    }
  }
  if (!catalogs.size)
    throw new Error(
      "Ingen gyldige mattilbudsaviser ble funnet for de lokale butikkene.",
    );
  return {
    version: COLLECTION_VERSION,
    chains,
    storeIndex: stores,
    storeIndexAt,
    discoveryWarnings: warnings,
    skippedCatalogs,
    catalogs: [...catalogs.values()].map((c) => {
      const chain = byId.get(c.dealer_id),
        nationwide = c.all_stores === true;
      return {
        id: c.id,
        chain: chain.key,
        sourceId: chain.sourceId,
        label: chain.label,
        slug: chain.slug,
        title: c.label || "Tilbudsavis",
        expected:
          Number.isInteger(c.offer_count) && c.offer_count >= 0
            ? c.offer_count
            : null,
        pages: c.page_count ?? null,
        validFrom: c.run_from,
        validUntil: c.run_till,
        regional: !nationwide,
        phase: nationwide ? "modern" : "stores",
        localStores: nationwide
          ? stores.filter((s) => s.sourceId === chain.sourceId)
          : [],
        localityVerified: nationwide,
        storesCheckedAt: nationwide ? now.toISOString() : null,
        storeIds: [],
        storeSignatures: [],
        outsideArea: false,
        unlocated: false,
        locationIssue: null,
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
    locality: {
      verified: c.localityVerified === true,
      stores: c.localStores || [],
      checkedAt: c.storesCheckedAt || null,
    },
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
  const catalogs = state.catalogs
    .filter((c) => !c.outsideArea)
    .map((c) => ({
      id: c.id,
      chain: c.label,
      title: c.title,
      expected: c.expected,
      received: c.count,
      done: c.done,
      error: c.error,
      missing: c.expected === null ? null : Math.max(0, c.expected - c.count),
      extra: c.expected === null ? null : Math.max(0, c.count - c.expected),
      unstructured: c.done && c.count === 0,
      regional: c.regional,
      localStores: c.localStores || [],
      localityVerified: c.localityVerified === true,
      storageError: c.storageError === true,
      unlocated: c.unlocated === true,
      locationIssue: c.locationIssue || null,
    }));
  const done = catalogs.filter((c) => c.done).length;
  const gaps = catalogs.filter(
    (c) =>
      !c.localityVerified ||
      c.error ||
      c.unstructured ||
      c.expected === null ||
      c.received !== c.expected,
  );
  return {
    complete:
      catalogs.length > 0 &&
      done === catalogs.length &&
      gaps.length === 0 &&
      !state.discoveryWarnings?.length,
    surveyedChains: state.chains.length,
    chainsWithFlyers: new Set(
      state.catalogs.filter((c) => c.localStores?.length).map((c) => c.chain),
    ).size,
    catalogsTotal: catalogs.length,
    catalogsDone: done,
    offersFetched: catalogs.reduce((n, c) => n + c.received, 0),
    missing: catalogs.reduce((n, c) => n + (c.missing || 0), 0),
    extra: catalogs.reduce((n, c) => n + (c.extra || 0), 0),
    gaps: gaps.length,
    cachedCatalogs: state.catalogs.filter(
      (c) => c.cached && c.localityVerified && c.localStores?.length,
    ).length,
    catalogsSurveyed: state.catalogs.length,
    localStoresSurveyed: state.storeIndex?.length || 0,
    localChainsSurveyed: new Set(
      (state.storeIndex || []).map((s) => s.sourceId),
    ).size,
    skippedCatalogs: state.skippedCatalogs || 0,
    discoveryWarnings: state.discoveryWarnings || [],
    catalogsExcluded: state.catalogs.filter((c) => c.outsideArea).length,
    catalogsUnlocated: state.catalogs.filter((c) => c.unlocated).length,
    locationsPending: state.catalogs.filter(
      (c) => c.phase === "stores" && !c.done,
    ).length,
    catalogs,
    scope:
      "Tilbudsaviser knyttet til butikker i " +
      LOCAL_AREA_LABEL +
      ". Tre avgrensede butikksøk brukes. Bare mataviser knyttet til de lokale butikk-ID-ene hentes. Kilden kan mangle butikker og varer.",
  };
}

export async function startCollection(env, now = new Date(), force = false) {
  let storeCache = null;
  if (!force) {
    const row = await env.DB.prepare(
      "SELECT state FROM offer_runs WHERE completed_at>=? AND status IN ('complete','incomplete') ORDER BY completed_at DESC LIMIT 1",
    )
      .bind(new Date(now.valueOf() - STORE_CACHE_MS).toISOString())
      .first();
    if (row) storeCache = JSON.parse(row.state);
  }
  const state = await discoverCatalogs(now, storeCache);
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
          previous.version !== COLLECTION_VERSION ||
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
  const run = await env.DB.prepare(
    "SELECT * FROM offer_runs WHERE id=? AND key_hash=?",
  )
    .bind(id, await keyHash(key))
    .first();
  return run && JSON.parse(run.state).version === COLLECTION_VERSION
    ? run
    : null;
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
    const storeTodo = waiting
      .filter((c) => c.phase === "stores")
      .slice(0, BATCH);
    const todo = [
      ...waiting.filter((c) => c.phase === "modern").slice(0, 12),
      ...waiting
        .filter((c) => c.phase === "legacy")
        .slice(0, waiting.some((c) => c.phase === "modern") ? 3 : BATCH),
    ];
    const [answers, storeAnswers] = await Promise.all([
      sourcePages(todo),
      Promise.allSettled(
        storeTodo.map(async (c) => {
          const url = new URL(
            "catalogs/" + encodeURIComponent(c.id) + "/stores",
            API,
          );
          url.search = new URLSearchParams({
            limit: String(LIMIT),
            offset: String(c.offset),
            r_lat: String(STORE_SEARCHES[0].latitude),
            r_lng: String(STORE_SEARCHES[0].longitude),
          });
          return JSON.parse(await source(url));
        }),
      ),
    ]);
    for (let i = 0; i < storeTodo.length; i++) {
      const c = storeTodo[i],
        answer = storeAnswers[i];
      try {
        if (answer.status !== "fulfilled") throw answer.reason;
        const page = answer.value;
        if (!Array.isArray(page) || page.length > LIMIT)
          throw new Error(
            "Butikkilden har et ukjent format eller støtter ikke paginering.",
          );
        if (!page.length) {
          if (!c.storeIds.length) {
            // A valid empty response is a metadata gap, not evidence that
            // this flyer is out of town. Its products are never fetched.
            c.unlocated = true;
            c.locationIssue =
              "Kilden oppgir ingen butikkadresser. Avisen utelates fra lokale tilbud og planlegging.";
            c.done = true;
            c.fetchedAt = now.toISOString();
            c.offset = 0;
            continue;
          }
          c.localityVerified = true;
          c.storesCheckedAt = now.toISOString();
          c.offset = 0;
          if (c.localStores.length) c.phase = "modern";
          else {
            c.outsideArea = true;
            c.done = true;
            c.fetchedAt = now.toISOString();
          }
          continue;
        }
        if (
          page.some(
            (s) =>
              typeof s.id !== "string" ||
              s.dealer_id !== c.sourceId ||
              typeof s.city !== "string" ||
              !s.city.trim() ||
              typeof s.country?.id !== "string",
          )
        )
          throw new Error(
            "Avisen kunne ikke knyttes til sikre butikkadresser.",
          );
        const signature = page
          .map((s) => s.id)
          .sort()
          .join("|");
        if (c.storeSignatures.includes(signature) || c.offset >= 10000)
          throw new Error(
            "Butikkilden gjentar sider eller overskrider kapasiteten.",
          );
        c.storeSignatures.push(signature);
        const seen = new Set(c.storeIds);
        for (const s of page) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          const area = areaForStore(s);
          if (area)
            c.localStores.push({
              id: s.id,
              area,
              name: String(s.name || c.label + " " + s.city).slice(0, 150),
              city: s.city.slice(0, 80),
              street: String(s.street || "").slice(0, 150),
              postcode: String(s.zip_code || "").slice(0, 10),
            });
        }
        c.storeIds = [...seen];
        if (c.localStores.length) {
          // Positive local proof is sufficient: we do not enumerate the rest
          // of a nationwide store list to establish the same fact again.
          c.localityVerified = true;
          c.storesCheckedAt = now.toISOString();
          c.phase = "modern";
          c.offset = 0;
        } else c.offset += LIMIT;
      } catch (error) {
        c.error = "Lokal gyldighet kunne ikke kontrolleres: " + error.message;
        c.done = true;
        c.fetchedAt = now.toISOString();
      }
    }
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
          // Both interfaces can contain unique offers, even when the first
          // already reaches the advertised count. Always finish both.
          if (c.phase === "modern") {
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
      c.storageError = true;
      c.error =
        "Lagrede tilbud stemmer ikke med innsamlingen. Avisen brukes ikke; hent den på nytt.";
      c.count = saved;
    }
  }
  const coverage = collectionCoverage(state);
  const damaged = new Set(
    state.catalogs.filter((c) => c.storageError).map((c) => c.id),
  );
  const products = [...unique.values()].filter(
    (o) => !damaged.has(o.publicationId),
  );
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
      chains: state.chains.filter((chain) =>
        state.catalogs.some(
          (c) => c.chain === chain.key && c.localStores?.length,
        ),
      ),
      shoppingArea: LOCAL_AREA_LABEL,
      localityVerified:
        state.version === COLLECTION_VERSION &&
        products.every((o) => o.locality?.verified === true),
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
