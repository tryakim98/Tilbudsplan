import { INGREDIENTS } from "./recipes.js";
import { catalog, emptyProfile, withDefaults, localDate } from "./model.js";
export { emptyProfile, withDefaults, catalog };
export const normalize = (s = "") =>
  String(s)
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/g, " ")
    .trim();
export function staleData(meta, now = new Date()) {
  const date = new Date(meta?.generated);
  return (
    !Number.isFinite(date.valueOf()) ||
    now - date > 7 * 86400000 ||
    date - now > 86400000
  );
}
export function price(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 ? value : null;
  const s = String(value ?? "").trim();
  if (!s || /%|for|fra|\//i.test(s)) return null;
  const m = s.match(
    /^(?:kr\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*[,.-]*\s*(?:kr)?)?$/i,
  );
  return m ? Number(m[1].replace(",", ".")) : null;
}
export function packageSize(o, unit) {
  if (o.manual) return o.quantity;
  const text = String(o.mengde || "")
    .replaceAll(",", ".")
    .toLowerCase();
  if (/\d\s*[-–x×]\s*\d/.test(text)) return null;
  if (unit === "g") {
    const m = text.match(/\b(\d+(?:\.\d+)?)\s*(kg|g)\b/);
    if (m) return Number(m[1]) * (m[2] === "kg" ? 1000 : 1);
    return /\b(?:pr\.?|per)\s*kg\b/.test(text) ? 1000 : null;
  }
  if (unit === "ml") {
    const m = text.match(/\b(\d+(?:\.\d+)?)\s*(ml|dl|l)\b/);
    return m ? Number(m[1]) * { ml: 1, dl: 100, l: 1000 }[m[2]] : null;
  }
  if (unit === "stk") {
    const m = text.match(/\b(\d+)\s*(?:stk|pk|pakning)\b/);
    return m ? Number(m[1]) : null;
  }
  return null;
}
export function ingredientOffer(o, id) {
  if (o.manual) return o.ingredient === id;
  const text = normalize(o.name);
  if (
    /bukett|fudge|sjampo|shampoo|servering|blomst|hund|katt|kosttilskudd/.test(
      text,
    )
  )
    return false;
  if (["beans", "chickpeas"].includes(id)) return false;
  if (
    ["pepper", "onion", "garlic", "lemon", "cucumber", "eggs"].includes(id) &&
    /pulver|krydder|saus|dressing|salat|sjokolade|pask/.test(text)
  )
    return false;
  return INGREDIENTS[id][5].some((k) =>
    new RegExp("(?:^| )" + normalize(k) + "(?:er|ene|en)?(?: |$)").test(text),
  );
}
export function cleanOffers(products = []) {
  const map = new Map();
  for (const raw of products) {
    if (!raw || typeof raw.name !== "string") continue;
    const o = { ...raw };
    o.store_key = String(o.store_key || normalize(o.store));
    o.store_label = String(o.store_label || o.store || "Ukjent butikk");
    o.id = normalize([o.store_key, o.name, o.mengde, o.price].join(" "));
    o.matches = Object.keys(INGREDIENTS).filter((id) => ingredientOffer(o, id));
    if (o.matches.length) map.set(o.id, o);
  }
  return [...map.values()];
}
export function combinedOffers(offers, p) {
  return [
    ...offers,
    ...(p.manualOffers || []).map((o) => ({
      ...o,
      manual: true,
      matches: [o.ingredient],
      store_key: normalize(o.store),
      store_label: o.store,
      category: INGREDIENTS[o.ingredient][4],
      mengde: o.quantity + " " + INGREDIENTS[o.ingredient][1],
    })),
  ];
}
export function offerActive(o, stale, today = localDate()) {
  if (!o.manual && stale) return false;
  const start = o.validFrom || o.valid_from;
  const end = o.validUntil || o.valid_until;
  if (
    (start && today < String(start).slice(0, 10)) ||
    (end && today > String(end).slice(0, 10))
  )
    return false;
  if (o.manual && (!start || !end)) return false;
  // Do not infer entitlement to membership discounts from a generic source.
  if (!o.manual && /medlem|trumf|kundeklubb/i.test(o.merknad || ""))
    return false;
  return true;
}
export const eligible = (r, p) =>
  !!r &&
  !r.ingredients.some(([id]) => p.dislikes.includes(id)) &&
  (!p.goals.includes("vegetarian") || r.tags.includes("vegetarian")) &&
  (!p.maxTime || r.time <= p.maxTime);
export function availableOffers(offers, p, stale) {
  const today = localDate();
  return combinedOffers(offers, p).filter(
    (o) =>
      offerActive(o, stale, today) &&
      !p.excluded.includes(o.id) &&
      (!p.stores.length || p.stores.includes(o.store_key)) &&
      !o.matches.some((id) => p.dislikes.includes(id)),
  );
}
export function offerFor(id, quantity, pool) {
  if (quantity <= 0) return null;
  return (
    pool
      .filter((o) => ingredientOffer(o, id))
      .map((o) => ({
        offer: o,
        size: packageSize(o, INGREDIENTS[id][1]),
        price: price(o.price),
      }))
      .filter((o) => o.size > 0 && o.price > 0)
      .map((o) => ({
        ...o,
        cost: Math.ceil((quantity - 1e-8) / o.size) * o.price,
      }))
      .sort((a, b) => a.cost - b.cost)[0] || null
  );
}
export function storePool(offers, p) {
  const scores = new Map();
  for (const o of offers)
    scores.set(
      o.store_key,
      (scores.get(o.store_key) || 0) + 1 + (p.selected.includes(o.id) ? 20 : 0),
    );
  const allowed = new Set(
    [...scores]
      .sort((a, b) => b[1] - a[1])
      .slice(0, p.maxStores)
      .map((x) => x[0]),
  );
  return offers.filter((o) => allowed.has(o.store_key));
}
function totalsFor(p) {
  const totals = new Map();
  const all = catalog(p);
  for (const rid of p.plan) {
    const r = all.find((r) => r.id === rid);
    if (!r) continue;
    for (const [id, n] of r.ingredients)
      totals.set(id, (totals.get(id) || 0) + (n * p.servings) / 2);
  }
  return totals;
}
function itemsFor(p, totals, pool) {
  return [...totals].map(([id, quantity]) => {
    const [name, unit, defaultSize, estimate, group] = INGREDIENTS[id];
    const atHome = Math.min(quantity, p.pantry?.[id] || 0);
    const need = Math.max(0, quantity - atHome);
    const match = offerFor(id, need, pool);
    const size = match?.size || defaultSize;
    const packs = Math.ceil((need - 1e-8) / size);
    const cost = need > 0 ? (match ? match.cost : packs * estimate) : 0;
    return {
      id,
      name,
      unit,
      quantity,
      atHome,
      need,
      group,
      packs: Math.max(0, packs),
      size,
      cost,
      offer: match?.offer || null,
      leftover: Math.max(
        0,
        Math.max(0, p.pantry?.[id] || 0) + packs * size - quantity,
      ),
    };
  });
}
export function basket(p, offers, stale) {
  return basketWithPool(p, availableOffers(offers, p, stale));
}
function basketWithPool(p, pool) {
  const totals = totalsFor(p);
  // Compare actual basket cost across store combinations, not offer counts.
  const keys = [...new Set(pool.map((o) => o.store_key))];
  if (keys.length <= p.maxStores) return itemsFor(p, totals, pool);
  if (keys.length > 8) {
    const chosen = [];
    let best = itemsFor(p, totals, []);
    let bestCost = Infinity;
    for (let round = 0; round < p.maxStores; round++) {
      let next = null;
      for (const key of keys.filter((k) => !chosen.includes(k))) {
        const items = itemsFor(
          p,
          totals,
          pool.filter(
            (o) => chosen.includes(o.store_key) || o.store_key === key,
          ),
        );
        const cost = items.reduce((n, i) => n + i.cost, 0);
        if (cost < bestCost - 0.01) {
          next = key;
          best = items;
          bestCost = cost;
        }
      }
      if (!next) break;
      chosen.push(next);
    }
    return best;
  }
  let best = null;
  let bestCost = Infinity;
  let bestCount = Infinity;
  for (let mask = 1; mask < 2 ** keys.length; mask++) {
    const chosen = keys.filter((_, i) => mask & (1 << i));
    if (chosen.length > p.maxStores) continue;
    const items = itemsFor(
      p,
      totals,
      pool.filter((o) => chosen.includes(o.store_key)),
    );
    const cost = items.reduce((n, i) => n + i.cost, 0);
    const used = new Set(
      items.filter((i) => i.offer).map((i) => i.offer.store_key),
    ).size;
    if (
      cost < bestCost - 0.01 ||
      (Math.abs(cost - bestCost) < 0.01 && used < bestCount)
    ) {
      best = items;
      bestCost = cost;
      bestCount = used;
    }
  }
  return best || itemsFor(p, totals, []);
}
export const basketTotal = (p, offers, stale) =>
  basket(p, offers, stale).reduce((n, i) => n + i.cost, 0);
export function recipeEstimate(r, servings = 2) {
  return r.ingredients.reduce(
    (sum, [id, n]) =>
      sum + ((n * servings) / 2 / INGREDIENTS[id][2]) * INGREDIENTS[id][3],
    0,
  );
}
export function recipeScore(r, p, pool) {
  if (!eligible(r, p)) return -Infinity;
  const matches = r.ingredients.filter(([id]) =>
    pool.some((o) => ingredientOffer(o, id)),
  );
  const picked = r.ingredients.filter(([id]) =>
    pool.some((o) => p.selected.includes(o.id) && ingredientOffer(o, id)),
  ).length;
  const pantry = r.ingredients.reduce(
    (n, [id, q]) =>
      n + Math.min(1, (p.pantry?.[id] || 0) / ((q * p.servings) / 2)),
    0,
  );
  return (
    matches.length * 3 +
    picked * 8 +
    r.tags.filter((t) => p.goals.includes(t)).length * 7 +
    r.ingredients.filter(([id]) => p.favorites.includes(id)).length * 4 +
    (p.saved.includes(r.id) ? 3 : 0) +
    ((p.ratings[r.id] || 3) - 3) * 4 +
    pantry * 2
  );
}
export function makePlan(p, offers, stale, variation = 0) {
  const all = catalog(p);
  const pool = availableOffers(offers, p, stale);
  const chosen = Array(p.days).fill(null);
  const used = new Set();
  for (const i of p.locked || []) {
    const r = all.find((r) => r.id === p.plan[i]);
    if (i < p.days && eligible(r, p)) {
      chosen[i] = r.id;
      r.ingredients.forEach(([id]) => used.add(id));
    }
  }
  const remaining = all.filter((r) => eligible(r, p) && !chosen.includes(r.id));
  for (let i = 0; i < p.days && remaining.length; i++) {
    if (chosen[i]) continue;
    const score = (r) =>
      recipeScore(r, p, pool) +
      r.ingredients.filter(([id]) => used.has(id)).length * 0.6 +
      (variation ? ((all.indexOf(r) * 17 + variation * 13) % 23) / 4 : 0);
    remaining.sort((a, b) => score(b) - score(a));
    const r = remaining.shift();
    chosen[i] = r.id;
    r.ingredients.forEach(([id]) => used.add(id));
  }
  let plan = chosen.filter(Boolean);
  const lockedIds = new Set(
    (p.locked || []).map((i) => chosen[i]).filter(Boolean),
  );
  const costs = new Map();
  const costFor = (ids) => {
    const key = [...ids].sort().join("|");
    if (!costs.has(key))
      costs.set(
        key,
        basketWithPool({ ...p, plan: ids }, pool).reduce(
          (n, i) => n + i.cost,
          0,
        ),
      );
    return costs.get(key);
  };
  // Bounded local search: lower full-package cost while keeping locked meals and constraints.
  if (p.budget > 0) {
    for (let round = 0; round < 7; round++) {
      const cost = costFor(plan);
      if (cost <= p.budget) break;
      let best = null;
      for (let i = 0; i < plan.length; i++) {
        if (lockedIds.has(plan[i])) continue;
        for (const r of all) {
          if (!eligible(r, p) || plan.includes(r.id)) continue;
          const trial = [...plan];
          trial[i] = r.id;
          const candidate = costFor(trial);
          if (
            candidate < cost - 0.01 &&
            (!best ||
              candidate < best.cost - 0.01 ||
              (Math.abs(candidate - best.cost) < 0.01 &&
                recipeScore(r, p, pool) > best.score))
          )
            best = {
              plan: trial,
              cost: candidate,
              score: recipeScore(r, p, pool),
            };
        }
      }
      if (!best) break;
      plan = best.plan;
    }
  }
  return plan;
}
export function reconcileChecks(p, before, after) {
  const prior = new Map(before.map((i) => [i.id, i]));
  return p.checked.filter((id) => {
    const a = prior.get(id),
      b = after.find((i) => i.id === id);
    return (
      a &&
      b &&
      a.need === b.need &&
      a.size === b.size &&
      a.packs === b.packs &&
      a.offer?.id === b.offer?.id
    );
  });
}
