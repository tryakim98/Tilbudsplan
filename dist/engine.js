import { INGREDIENTS, RECIPES } from "./recipes.js";
export const normalize = (s = "") =>
  String(s)
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/g, " ")
    .trim();
export const emptyProfile = (name = "Min kokebok") => ({
  name,
  saved: [],
  ratings: {},
  notes: {},
  dislikes: [],
  favorites: [],
  goals: [],
  plan: [],
  checked: [],
  selected: [],
  excluded: [],
  stores: [],
  servings: 2,
  days: 5,
  maxStores: 2,
});
export function staleData(meta, now = new Date()) {
  const date = new Date(meta?.generated);
  return (
    !Number.isFinite(date.valueOf()) ||
    now - date > 7 * 86400000 ||
    date - now > 86400000
  );
}
export function price(value) {
  const s = String(value ?? "").trim();
  if (!s || /%|for|fra|\//i.test(s)) return null;
  const m = s.match(
    /^(?:kr\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*[,.-]*\s*(?:kr)?)?$/i,
  );
  return m ? Number(m[1].replace(",", ".")) : null;
}
export function packageSize(offer, unit) {
  const text = String(offer.mengde || "")
    .replaceAll(",", ".")
    .toLowerCase();
  if (/\bpr\.?\s*kg|per kg|kilopris/i.test(text))
    return unit === "g" ? 1000 : null;
  // Ambiguous ranges/multipacks and drained weights are not silently guessed.
  if (/\d\s*[-–x×]\s*\d/.test(text)) return null;
  if (unit === "g") {
    const m = text.match(/\b(\d+(?:\.\d+)?)\s*(kg|g)\b/);
    return m ? Number(m[1]) * (m[2] === "kg" ? 1000 : 1) : null;
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
export function ingredientOffer(offer, id) {
  const text = normalize(offer.name);
  if (
    /bukett|fudge|sjampo|shampoo|servering|blomst|hund|katt|kosttilskudd/.test(
      text,
    )
  )
    return false;
  if (["beans", "chickpeas"].includes(id)) return false; // drained quantity unavailable in source
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
    if (!o.matches.length) continue;
    map.set(o.id, o);
  }
  return [...map.values()];
}
export const eligible = (r, p) =>
  !r.ingredients.some(([id]) => p.dislikes.includes(id)) &&
  (!p.goals.includes("vegetarian") || r.tags.includes("vegetarian"));
export function availableOffers(offers, p, stale) {
  return stale
    ? []
    : offers.filter(
        (o) =>
          !p.excluded.includes(o.id) &&
          (!p.stores.length || p.stores.includes(o.store_key)) &&
          !o.matches.some((id) => p.dislikes.includes(id)),
      );
}
export function offerFor(id, quantity, pool) {
  const unit = INGREDIENTS[id][1];
  return (
    pool
      .filter((o) => ingredientOffer(o, id))
      .map((o) => ({
        offer: o,
        size: packageSize(o, unit),
        price: price(o.price),
      }))
      .filter((o) => o.size > 0 && o.price > 0)
      .map((o) => ({ ...o, cost: Math.ceil(quantity / o.size) * o.price }))
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
export function recipeScore(r, p, pool) {
  if (!eligible(r, p)) return -Infinity;
  const matches = r.ingredients.filter(([id]) =>
    pool.some((o) => ingredientOffer(o, id)),
  );
  const picked = r.ingredients.filter(([id]) =>
    pool.some((o) => p.selected.includes(o.id) && ingredientOffer(o, id)),
  ).length;
  return (
    matches.length * 3 +
    picked * 8 +
    r.tags.filter((t) => p.goals.includes(t)).length * 7 +
    r.ingredients.filter(([id]) => p.favorites.includes(id)).length * 4 +
    (p.saved.includes(r.id) ? 3 : 0) +
    ((p.ratings[r.id] || 3) - 3) * 4
  );
}
export function makePlan(p, offers, stale, variation = 0) {
  const pool = storePool(availableOffers(offers, p, stale), p);
  const remaining = RECIPES.filter((r) => eligible(r, p));
  const chosen = [];
  const used = new Set();
  while (chosen.length < p.days && remaining.length) {
    const score = (r) =>
      recipeScore(r, p, pool) +
      r.ingredients.filter(([id]) => used.has(id)).length * 0.6 +
      (variation ? ((RECIPES.indexOf(r) * 17 + variation * 13) % 23) / 4 : 0);
    remaining.sort((a, b) => score(b) - score(a));
    const r = remaining.shift();
    chosen.push(r.id);
    r.ingredients.forEach(([id]) => used.add(id));
  }
  return chosen;
}
export function basket(p, offers, stale) {
  const totals = new Map();
  for (const rid of p.plan) {
    const r = RECIPES.find((r) => r.id === rid);
    if (!r) continue;
    for (const [id, n] of r.ingredients)
      totals.set(id, (totals.get(id) || 0) + (n * p.servings) / 2);
  }
  const pool = storePool(availableOffers(offers, p, stale), p);
  return [...totals].map(([id, quantity]) => {
    const [name, unit, defaultSize, estimate, group] = INGREDIENTS[id];
    const match = offerFor(id, quantity, pool);
    const size = match?.size || defaultSize;
    const packs = Math.ceil((quantity - 1e-8) / size);
    const cost = match ? match.cost : packs * estimate;
    return {
      id,
      name,
      unit,
      quantity,
      group,
      packs,
      size,
      cost,
      offer: match?.offer || null,
      leftover: Math.max(0, packs * size - quantity),
    };
  });
}
export function recipeEstimate(r, servings = 2) {
  return r.ingredients.reduce(
    (sum, [id, n]) =>
      sum + ((n * servings) / 2 / INGREDIENTS[id][2]) * INGREDIENTS[id][3],
    0,
  );
}
