import { INGREDIENTS, RECIPES, GOALS } from "./recipes.js";
import { chainInfo } from "./offers.js";
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
  memberChains: [],
  appChains: [],
  planBasis: null,
  servings: 2,
  days: 7,
  maxStores: 0,
  pantry: {},
  budget: 0,
  maxTime: 0,
  locked: [],
  customRecipes: [],
  generatedRecipes: [],
  manualOffers: [],
  planMode: "luxury",
  allowRepeats: false,
  preferOrganic: true,
  preferVariety: true,
});
export const withDefaults = (data) => {
  const p = { ...emptyProfile(), ...data };
  if (Array.isArray(p.stores) && p.stores.every((x) => typeof x === "string"))
    p.stores = [...new Set(p.stores.map((x) => chainInfo(x).key))];
  return p;
};
export const catalog = (p) => [
  ...RECIPES,
  ...(p.customRecipes || []),
  ...(p.generatedRecipes || []),
];
const osloDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function localDate(now = new Date()) {
  return osloDate.format(now);
}
const object = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x, max = 300) => typeof x === "string" && x.length <= max;
const finite = (x, max = 1000000) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max;
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}
export function validCustomRecipe(r) {
  return (
    object(r) &&
    /^custom-[a-f0-9-]{8,48}$/.test(r.id || "") &&
    text(r.title, 100) &&
    r.title.trim().length > 0 &&
    Number.isInteger(r.time) &&
    r.time > 0 &&
    r.time <= 360 &&
    text(r.tip || "", 500) &&
    Array.isArray(r.tags) &&
    r.tags.length <= 7 &&
    r.tags.every((t) => Object.hasOwn(GOALS, t)) &&
    Array.isArray(r.ingredients) &&
    r.ingredients.length > 0 &&
    r.ingredients.length <= 40 &&
    r.ingredients.every(
      (x) =>
        Array.isArray(x) &&
        x.length === 2 &&
        Object.hasOwn(INGREDIENTS, x[0]) &&
        finite(x[1], 20000) &&
        x[1] > 0,
    ) &&
    new Set(r.ingredients.map((x) => x[0])).size === r.ingredients.length &&
    Array.isArray(r.steps) &&
    r.steps.length > 0 &&
    r.steps.length <= 20 &&
    r.steps.every((x) => text(x, 2000) && x.trim().length > 0)
  );
}
export function validManualOffer(o) {
  return (
    object(o) &&
    /^manual-[a-f0-9-]{8,48}$/.test(o.id || "") &&
    Object.hasOwn(INGREDIENTS, o.ingredient) &&
    text(o.name, 150) &&
    o.name.trim().length > 0 &&
    text(o.store, 80) &&
    o.store.trim().length > 0 &&
    finite(o.price, 10000) &&
    o.price > 0 &&
    finite(o.quantity, 100000) &&
    o.quantity > 0 &&
    validDate(o.validFrom) &&
    validDate(o.validUntil) &&
    o.validFrom <= o.validUntil &&
    typeof o.member === "boolean" &&
    (o.beforePrice === undefined ||
      (finite(o.beforePrice, 10000) && o.beforePrice > o.price)) &&
    text(o.sourceUrl || "", 1000) &&
    (!o.sourceUrl || /^https?:\/\//i.test(o.sourceUrl))
  );
}
export function validGeneratedRecipe(r) {
  return (
    object(r) &&
    /^offer-[a-f0-9]{16}$/.test(r.id || "") &&
    validCustomRecipe({ ...r, id: "custom-" + r.id.slice(6) }) &&
    r.createdByOffers === true &&
    text(r.style, 30) &&
    Object.hasOwn(INGREDIENTS, r.main) &&
    Array.isArray(r.sourceOfferIds) &&
    r.sourceOfferIds.length <= 20 &&
    r.sourceOfferIds.every((id) => text(id, 300))
  );
}
export function validateProfile(raw) {
  if (!object(raw)) return false;
  const p = withDefaults(raw);
  if (!text(p.name, 60) || !p.name.trim()) return false;
  for (const k of [
    "saved",
    "dislikes",
    "favorites",
    "goals",
    "plan",
    "checked",
    "selected",
    "excluded",
    "stores",
    "memberChains",
    "appChains",
  ])
    if (
      !Array.isArray(p[k]) ||
      p[k].length > 500 ||
      p[k].some((x) => !text(x, 300))
    )
      return false;
  if (
    p.plan.length > 7 ||
    ![1, 2, 3, 4, 5, 6, 8].includes(p.servings) ||
    !Number.isInteger(p.days) ||
    p.days < 1 ||
    p.days > 7 ||
    ![0, 1, 2, 3, 8].includes(p.maxStores) ||
    !["taste", "offers", "discounts", "luxury"].includes(p.planMode) ||
    typeof p.allowRepeats !== "boolean" ||
    typeof p.preferOrganic !== "boolean" ||
    typeof p.preferVariety !== "boolean"
  )
    return false;
  if (
    p.planBasis !== null &&
    (!object(p.planBasis) ||
      !text(p.planBasis.generated, 40) ||
      typeof p.planBasis.complete !== "boolean" ||
      !finite(p.planBasis.offers) ||
      !finite(p.planBasis.catalogs) ||
      !finite(p.planBasis.missing))
  )
    return false;
  if (
    !object(p.ratings) ||
    Object.values(p.ratings).some(
      (x) => !Number.isInteger(x) || x < 1 || x > 5,
    ) ||
    !object(p.notes) ||
    Object.values(p.notes).some((x) => !text(x, 3000))
  )
    return false;
  if (
    !object(p.pantry) ||
    Object.entries(p.pantry).some(
      ([id, n]) => !Object.hasOwn(INGREDIENTS, id) || !finite(n),
    )
  )
    return false;
  if (
    !finite(p.budget, 10000) ||
    !finite(p.maxTime, 360) ||
    !Array.isArray(p.locked) ||
    p.locked.some((i) => !Number.isInteger(i) || i < 0 || i > 6)
  )
    return false;
  if (
    !Array.isArray(p.customRecipes) ||
    p.customRecipes.length > 50 ||
    !p.customRecipes.every(validCustomRecipe) ||
    new Set(p.customRecipes.map((r) => r.id)).size !== p.customRecipes.length
  )
    return false;
  if (
    !Array.isArray(p.manualOffers) ||
    p.manualOffers.length > 100 ||
    !p.manualOffers.every(validManualOffer)
  )
    return false;
  if (
    !Array.isArray(p.generatedRecipes) ||
    p.generatedRecipes.length > 100 ||
    !p.generatedRecipes.every(validGeneratedRecipe) ||
    new Set(catalog(p).map((r) => r.id)).size !== catalog(p).length
  )
    return false;
  const ids = new Set(catalog(p).map((r) => r.id));
  if (
    [
      ...p.saved,
      ...p.plan,
      ...Object.keys(p.ratings),
      ...Object.keys(p.notes),
    ].some((id) => !ids.has(id))
  )
    return false;
  if (
    [...p.dislikes, ...p.favorites, ...p.checked].some(
      (id) => !Object.hasOwn(INGREDIENTS, id),
    ) ||
    p.goals.some((id) => !Object.hasOwn(GOALS, id))
  )
    return false;
  return JSON.stringify(p).length <= 240000;
}
