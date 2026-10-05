import {
  chainInfo,
  productKey,
  isoPeriod,
  parsePrice,
} from "../dist/offers.js";
const SOURCE =
  "https://raw.githubusercontent.com/Olewol/tilbudsavis/main/latest-data.json";
const ARCHIVES = "https://api.github.com/repos/Olewol/tilbudsavis/contents";
const dayMs = 86400000;
export function validSnapshot(data, now = new Date()) {
  const generated = new Date(data?.meta?.generated);
  return (
    Array.isArray(data?.products) &&
    data.products.length > 0 &&
    data.products.length <= 2000 &&
    Number.isFinite(generated.valueOf()) &&
    generated - now <= dayMs &&
    now - generated <= 366 * dayMs &&
    data.products.every(
      (o) => o && typeof o.name === "string" && o.name.length <= 500,
    ) &&
    JSON.stringify(data).length < 1500000
  );
}
export function buildHistory(snapshots, current, now = new Date()) {
  const targetPeriod = isoPeriod(current.meta.generated);
  const cutoff = new Date(now.valueOf() - 365 * dayMs)
    .toISOString()
    .slice(0, 10);
  const groups = new Map();
  for (const data of snapshots) {
    if (!validSnapshot(data, now)) continue;
    const period = isoPeriod(data.meta.generated),
      date = String(data.meta.generated).slice(0, 10);
    if (period === targetPeriod || date < cutoff) continue;
    for (const o of data.products) {
      const key = productKey(o),
        value = parsePrice(o.price);
      if (!key || !value) continue;
      const id = chainInfo(o).key + "::" + key;
      if (!groups.has(id)) groups.set(id, new Map());
      const periods = groups.get(id);
      if (!periods.has(period))
        periods.set(period, { prices: new Set(), date });
      periods.get(period).prices.add(value);
    }
  }
  const result = {};
  for (const [id, periods] of groups) {
    const weeks = [...periods.values()];
    const values = weeks.map(
      (w) => [...w.prices].reduce((a, b) => a + b, 0) / w.prices.size,
    );
    const dates = weeks.map((w) => w.date).sort();
    result[id] = {
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      weeks: values.length,
      from: dates[0],
      until: dates.at(-1),
    };
  }
  return result;
}
async function readJson(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Tilbudsplan", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Kilden svarte " + r.status);
  const body = await r.text();
  if (body.length > 1500000) throw new Error("Kildedata er for store");
  return JSON.parse(body);
}
export async function refreshOffers(env, now = new Date()) {
  const current = await readJson(SOURCE);
  if (!validSnapshot(current, now))
    throw new Error("Kilden har ugyldig dato eller data");
  const prior = await env.DB.prepare(
    "SELECT period FROM offer_snapshots",
  ).all();
  const snapshots = [current];
  let archiveErrors = 0;
  // Retry missing archives on later collections after partial source failures.
  const known = new Set(prior.results.map((r) => r.period));
  const [year, currentWeek] = isoPeriod(current.meta.generated)
    .split("-W")
    .map(Number);
  if (known.size < 54) {
    try {
      const files = await readJson(ARCHIVES);
      const names = files
        .filter((f) => /^data_uke\d+\.json$/.test(f.name))
        .map((f) => f.name)
        .filter((name) => {
          const week = Number(name.match(/uke(\d+)/)[1]);
          const period = `${week > currentWeek ? year - 1 : year}-W${String(week).padStart(2, "0")}`;
          return !known.has(period);
        })
        .slice(-54);
      for (let i = 0; i < names.length; i += 4) {
        const batch = await Promise.allSettled(
          names
            .slice(i, i + 4)
            .map((name) =>
              readJson(
                "https://raw.githubusercontent.com/Olewol/tilbudsavis/main/" +
                  name,
              ),
            ),
        );
        for (const item of batch)
          if (item.status === "fulfilled" && validSnapshot(item.value, now))
            snapshots.push(item.value);
          else archiveErrors++;
      }
    } catch {
      archiveErrors++;
    }
  }
  const byPeriod = new Map();
  for (const data of snapshots) {
    const period = isoPeriod(data.meta.generated);
    const previous = byPeriod.get(period);
    if (!previous || previous.meta.generated < data.meta.generated)
      byPeriod.set(period, data);
  }
  const statements = [...byPeriod].map(([period, data]) =>
    env.DB.prepare(
      "INSERT INTO offer_snapshots (period,generated,payload,inserted_at) VALUES (?, ?, ?, ?) ON CONFLICT(period) DO UPDATE SET generated=excluded.generated,payload=excluded.payload,inserted_at=excluded.inserted_at WHERE excluded.generated > offer_snapshots.generated",
    ).bind(
      period,
      data.meta.generated,
      JSON.stringify(data),
      now.toISOString(),
    ),
  );
  for (let i = 0; i < statements.length; i += 40)
    await env.DB.batch(statements.slice(i, i + 40));
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS weeks, MIN(generated) AS earliest, MAX(generated) AS latest FROM offer_snapshots",
  ).first();
  return {
    updated: true,
    sourceGenerated: current.meta.generated,
    weeks: count.weeks,
    earliest: count.earliest,
    latest: count.latest,
    archiveErrors,
  };
}
export async function readOffers(
  env,
  fallback,
  force = false,
  now = new Date(),
) {
  const cutoff = new Date(now.valueOf() - 365 * dayMs)
    .toISOString()
    .slice(0, 10);
  const rows = await env.DB.prepare(
    "SELECT generated,payload FROM offer_snapshots WHERE generated >= ? ORDER BY generated DESC LIMIT 54",
  )
    .bind(cutoff)
    .all();
  const snapshots = rows.results.map((r) => JSON.parse(r.payload));
  let current = snapshots[0],
    sourceError = false;
  if (!current || force || now - new Date(current.meta.generated) > dayMs) {
    try {
      const data = await readJson(SOURCE);
      if (!validSnapshot(data, now)) throw new Error("Invalid source");
      current = data;
    } catch {
      sourceError = true;
      current = current || fallback;
    }
  }
  if (!current) throw new Error("Ingen tilbud tilgjengelig");
  const history = buildHistory(snapshots, current, now);
  const products = current.products.map((o) => {
    const key = productKey(o),
      stats = key ? history[chainInfo(o).key + "::" + key] : null;
    return { ...o, ...(stats ? { history: stats } : {}) };
  });
  const chains = [
    ...new Map(
      current.products.map((o) => {
        const c = chainInfo(o);
        return [c.key, c];
      }),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, "nb"));
  return {
    meta: {
      ...current.meta,
      historyWeeks: snapshots.length,
      historyFrom: snapshots.at(-1)?.meta.generated || null,
      chains,
      sourceError,
    },
    products,
  };
}
