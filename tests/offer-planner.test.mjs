import test from "node:test";
import assert from "node:assert/strict";
import { INGREDIENTS } from "../dist/recipes.js";
import {
  emptyProfile,
  localDate,
  catalog,
  validateProfile,
  validGeneratedRecipe,
} from "../dist/model.js";
import {
  cleanOffers,
  availableOffers,
  offerFor,
  basket,
  coverage,
  eligible,
  ingredientOffer,
} from "../dist/engine.js";
import { declaredOrganic, isAdvertisedOffer } from "../dist/offers.js";
import {
  planFromOffers,
  keepGeneratedRecipes,
  createOfferRecipes,
} from "../dist/offer-planner.js";

// Synthetic prices exist only in tests. The production collector reads source prices.
function offer(id, overrides = {}) {
  const item = INGREDIENTS[id];
  return {
    id: "test-" + id,
    name: item[5][0],
    price: 10,
    beforePrice: 20,
    store: "Meny",
    structured: true,
    currency: "NOK",
    sourcePack: { quantity: item[2], unit: item[1] },
    mengde: item[2] + " " + item[1],
    validFrom: localDate(),
    validUntil: localDate(),
    ...overrides,
  };
}
function fixture() {
  return cleanOffers(
    [
      "scampi",
      "porkmince",
      "potato",
      "greenbeans",
      "broccolini",
      "redonion",
      "pasta",
      "tomatoes",
      "parmesan",
      "rice",
      "soy",
    ].map((id) => offer(id)),
  );
}
function adopt(p, result) {
  return {
    ...p,
    plan: result.plan,
    generatedRecipes: keepGeneratedRecipes(
      p,
      result.generatedRecipes,
      result.plan,
    ),
  };
}

test("new complete recipes turn a limited offer catalog into a varied, budgeted week", () => {
  const p = {
    ...emptyProfile(),
    budget: 400,
    pantry: { oil: 1000, salt: 500, blackpepper: 50 },
  };
  const offers = fixture();
  const result = planFromOffers(p, offers, false);
  const saved = adopt(p, result);
  assert.equal(result.plan.length, 7);
  assert.equal(new Set(result.plan).size, 7);
  assert.ok(result.report.generated >= 4);
  assert.equal(result.report.metTarget, true);
  assert.equal(result.report.withinBudget, true);
  assert.ok(result.report.luxuryMeals > 0);
  assert.ok(result.report.variety.styles >= 3);
  assert.equal(validateProfile(saved), true);
  for (const recipe of result.generatedRecipes) {
    assert.equal(validGeneratedRecipe(recipe), true);
    assert.ok(recipe.steps.length >= 4);
    assert.ok(recipe.ingredients.some(([id]) => id === "salt"));
    assert.ok(recipe.ingredients.some(([id]) => id === "blackpepper"));
    assert.ok(
      recipe.sourceOfferIds.every((id) => offers.some((o) => o.id === id)),
    );
  }
  const items = basket(saved, offers, false);
  assert.equal(coverage(items).percent, result.report.achieved);
  assert.ok(
    Math.abs(items.reduce((n, i) => n + i.cost, 0) - result.report.cost) <
      0.001,
  );
  assert.ok(
    items
      .filter((i) => i.need > 0)
      .every((i) => i.packs >= 1 && i.cost === i.packs * i.offer.price),
  );
  const doubled = basket({ ...saved, servings: 4 }, offers, false);
  assert.ok(
    doubled.every(
      (i) => i.quantity === items.find((x) => x.id === i.id).quantity * 2,
    ),
  );
});

test("organic preference uses explicit labeling and respects package cost and budget", () => {
  const p = {
    ...emptyProfile(),
    days: 1,
    plan: ["salmon-butter"],
    preferOrganic: true,
  };
  const standard = offer("salmon", {
    id: "standard",
    price: 50,
    beforePrice: 80,
  });
  const organic = offer("salmon", {
    id: "organic",
    name: "Økologisk laksefilet",
    price: 55,
    beforePrice: 80,
  });
  const expensive = { ...organic, id: "expensive", price: 56 };
  const pool = availableOffers(cleanOffers([standard, organic]), p, false);
  assert.equal(
    offerFor("salmon", 300, pool, "luxury", Infinity, p).offer.id,
    "organic",
  );
  assert.equal(
    offerFor(
      "salmon",
      300,
      availableOffers(cleanOffers([standard, expensive]), p, false),
      "luxury",
      Infinity,
      p,
    ).offer.id,
    "standard",
  );
  assert.equal(
    offerFor("salmon", 300, pool, "luxury", 54, p).offer.id,
    "standard",
  );
  assert.equal(declaredOrganic({ name: "Laksefilet" }), false);
  assert.equal(declaredOrganic({ name: "Ikke økologisk laksefilet" }), false);
  assert.equal(
    declaredOrganic({ name: "Laksefilet", mengde: "Økologiske 400 g" }),
    true,
  );
  const pantry = Object.fromEntries(
    catalog(p)
      .find((r) => r.id === p.plan[0])
      .ingredients.filter(([id]) => id !== "salmon")
      .map(([id]) => [id, 10000]),
  );
  const items = basket(
    { ...p, budget: 53, pantry },
    cleanOffers([standard, organic]),
    false,
  );
  assert.equal(
    items.reduce((n, i) => n + i.cost, 0),
    50,
  );
  assert.equal(items.find((i) => i.id === "salmon").offer.id, "standard");
});

test("ordinary flyer prices do not count as offers or displace a real promotion", () => {
  const normal = offer("salmon", {
    id: "normal",
    name: "Laksefilet · fast lav pris",
    beforePrice: null,
    price: 5,
  });
  const promo = offer("salmon", { id: "promo", price: 50 });
  const normalOrganic = {
    ...normal,
    id: "ordinary-organic",
    name: "Økologisk laksefilet · alltid billigere",
    price: 50,
  };
  assert.equal(isAdvertisedOffer(normal), false);
  assert.equal(isAdvertisedOffer(normalOrganic), false);
  assert.equal(isAdvertisedOffer({ ...normal, beforePrice: 10 }), true);
  const p = { ...emptyProfile(), days: 1, plan: ["salmon-butter"] };
  const items = basket(p, cleanOffers([normal]), false);
  assert.ok(items.find((i) => i.id === "salmon").offer);
  assert.equal(coverage(items).offered, 0);
  const pool = availableOffers(cleanOffers([promo, normalOrganic]), p, false);
  assert.equal(
    offerFor("salmon", 300, pool, "luxury", Infinity, p).offer.id,
    "promo",
  );
});

test("source dates, membership and dietary constraints remain hard exclusions", () => {
  const offers = fixture();
  const p = {
    ...emptyProfile(),
    dislikes: ["pork"],
    goals: ["vegetarian"],
    maxTime: 30,
  };
  const generated = createOfferRecipes(p, availableOffers(offers, p, false));
  assert.ok(
    generated.every(
      (r) => eligible(r, p) && r.time <= 30 && r.tags.includes("vegetarian"),
    ),
  );
  assert.equal(
    eligible(
      { tags: [], time: 20, ingredients: [["porkmince", 200]] },
      { ...emptyProfile(), dislikes: ["pork"] },
    ),
    false,
  );
  const restricted = cleanOffers([
    offer("scampi", { accessKind: "member" }),
    offer("porkmince", { validUntil: "2020-01-01" }),
  ]);
  assert.equal(availableOffers(restricted, emptyProfile(), false).length, 0);
  assert.equal(
    availableOffers(
      restricted,
      { ...emptyProfile(), memberChains: ["meny"] },
      false,
    ).length,
    1,
  );
  assert.equal(availableOffers(offers, emptyProfile(), true).length, 0);
  assert.equal(
    ingredientOffer({ name: "Fjordland ferdigrett med scampi" }, "scampi"),
    false,
  );
});

test("locks and single-meal swaps preserve the other meals and the 80 percent floor", () => {
  const offers = fixture();
  const p = {
    ...emptyProfile(),
    budget: 400,
    pantry: { oil: 1000, salt: 500, blackpepper: 50 },
  };
  const first = planFromOffers(p, offers, false);
  const saved = { ...adopt(p, first), locked: [1, 4] };
  const next = planFromOffers(saved, offers, false, 2);
  assert.equal(next.plan[1], saved.plan[1]);
  assert.equal(next.plan[4], saved.plan[4]);
  const swapped = planFromOffers(saved, offers, false, 3, { replaceIndex: 0 });
  assert.equal(swapped.report.metTarget, true);
  assert.notEqual(swapped.plan[0], saved.plan[0]);
  assert.deepEqual(swapped.plan.slice(1), saved.plan.slice(1));
});

test("impossible constraints report failure without inventing sale prices or recipes", () => {
  const p = { ...emptyProfile(), budget: 1, maxTime: 10 };
  const result = planFromOffers(p, fixture(), false);
  assert.equal(result.report.metTarget, false);
  assert.equal(result.report.recipesCreated, 0);
  const noOffers = planFromOffers(emptyProfile(), [], false);
  assert.equal(noOffers.report.metTarget, false);
  assert.equal(noOffers.report.achieved, 0);
  assert.equal(noOffers.generatedRecipes.length, 0);
});

test("saved, rated and noted offer recipes survive menu replacement and JSON reload", () => {
  const p = {
    ...emptyProfile(),
    pantry: { oil: 1000, salt: 500, blackpepper: 50 },
  };
  const recipes = createOfferRecipes(p, availableOffers(fixture(), p, false));
  assert.ok(recipes.length >= 5);
  Object.assign(p, {
    generatedRecipes: recipes.slice(0, 5),
    saved: [recipes[0].id],
    ratings: { [recipes[1].id]: 5 },
    notes: { [recipes[2].id]: "Mer stekeskorpe" },
    plan: [recipes[3].id],
  });
  const kept = keepGeneratedRecipes(p, [], p.plan);
  assert.deepEqual(
    kept.map((r) => r.id),
    recipes.slice(0, 4).map((r) => r.id),
  );
  const restored = JSON.parse(JSON.stringify({ ...p, generatedRecipes: kept }));
  assert.equal(validateProfile(restored), true);
  assert.ok(catalog(restored).some((r) => r.id === recipes[0].id));
  assert.equal(restored.notes[recipes[2].id], "Mer stekeskorpe");
});
