import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES, INGREDIENTS } from "../dist/recipes.js";
import {
  emptyProfile,
  staleData,
  price,
  packageSize,
  ingredientOffer,
  cleanOffers,
  eligible,
  makePlan,
  basket,
  recipeScore,
  basketTotal,
  availableOffers,
  offerActive,
  reconcileChecks,
} from "../dist/engine.js";
import {
  localDate,
  withDefaults,
  validateProfile,
  validCustomRecipe,
  validManualOffer,
} from "../dist/model.js";
test("every recipe has complete ingredients and steps", () => {
  assert.equal(new Set(RECIPES.map((r) => r.id)).size, RECIPES.length);
  for (const r of RECIPES) {
    assert.ok(r.steps.length >= 4);
    assert.ok(r.ingredients.length >= 5);
    for (const [id, n] of r.ingredients) {
      assert.ok(INGREDIENTS[id]);
      assert.ok(n > 0);
    }
  }
});
test("diet restrictions are hard exclusions, not weak ranking preferences", () => {
  const p = {
    ...emptyProfile(),
    dislikes: ["chicken", "salmon", "mushroom"],
    goals: ["vegetarian"],
    days: 7,
  };
  const ids = makePlan(p, [], true, 5);
  assert.equal(ids.length, 7);
  assert.ok(
    ids.every((id) =>
      eligible(
        RECIPES.find((r) => r.id === id),
        p,
      ),
    ),
  );
});
test("favorites and ratings actually change the score", () => {
  const p = emptyProfile();
  const r = RECIPES[0];
  const base = recipeScore(r, p, []);
  p.favorites = ["chicken"];
  p.ratings[r.id] = 5;
  p.saved = [r.id];
  assert.ok(recipeScore(r, p, []) > base);
});
test("old and future-dated snapshots cannot become current prices", () => {
  assert.ok(staleData({ generated: "2026-09-21" }, new Date("2026-10-04")));
  assert.ok(staleData({ generated: "2027-01-01" }, new Date("2026-10-04")));
  assert.ok(!staleData({ generated: "2026-10-01" }, new Date("2026-10-04")));
});
test("parse prices conservatively", () => {
  assert.equal(price("119,-"), 119);
  assert.equal(price("29,90"), 29.9);
  assert.equal(price("3 for 2"), null);
  assert.equal(price("-40%"), null);
  assert.equal(price("fra 30"), null);
  assert.equal(packageSize({ mengde: "2 x 400 g" }, "g"), 800);
  assert.equal(packageSize({ mengde: "400 g eller 500 g" }, "g"), null);
  assert.equal(packageSize({ name: "EGG 6PK", mengde: "402 g" }, "stk"), 6);
  assert.equal(packageSize({ mengde: "18-pk" }, "stk"), 18);
  assert.equal(packageSize({ mengde: "400–600 g" }, "g"), null);
  assert.equal(packageSize({ mengde: "1,5 kg" }, "g"), 1500);
});
test("no egg noodles as eggs or non-food as dinner", () => {
  assert.equal(ingredientOffer({ name: "Eggnudler" }, "eggs"), false);
  assert.equal(ingredientOffer({ name: "Melon honning" }, "honey"), false);
  assert.equal(
    ingredientOffer(
      { name: "Prior kyllingfilet pepper og hvitløk" },
      "chicken",
    ),
    false,
  );
  assert.ok(ingredientOffer({ name: "Hjertefiskekaker" }, "fishcake"));
  assert.ok(ingredientOffer({ name: "Synnøve revet" }, "cheese"));
  assert.equal(ingredientOffer({ name: "Fudge Professional" }, "mince"), false);
  assert.equal(
    cleanOffers([{ name: "Stor astersbukett", category: "Storfe" }]).length,
    0,
  );
  assert.ok(ingredientOffer({ name: "Kyllingfileter" }, "chicken"));
});
test("shopping quantities sum across meals and round whole packages", () => {
  const p = { ...emptyProfile(), plan: ["sticky-chicken", "crispy-wraps"] };
  const items = basket(p, [], true);
  const chicken = items.find((i) => i.id === "chicken");
  assert.equal(chicken.quantity, 700);
  assert.equal(chicken.packs, 2);
  assert.equal(chicken.cost, 180);
  assert.equal(chicken.leftover, 500);
  p.servings = 4;
  assert.equal(
    basket(p, [], true).find((i) => i.id === "chicken").quantity,
    1400,
  );
});
test("store restrictions and stale data honored in cost calculation", () => {
  const p = { ...emptyProfile(), plan: ["sticky-chicken"], stores: ["a"] };
  const offers = cleanOffers([
    {
      name: "Kyllingfilet",
      mengde: "400 g",
      price: "40,-",
      store: "A",
      store_key: "a",
    },
    {
      name: "Kyllingfilet",
      mengde: "400 g",
      price: "1,-",
      store: "B",
      store_key: "b",
    },
  ]);
  assert.equal(
    basket(p, offers, false).find((i) => i.id === "chicken").cost,
    40,
  );
  assert.equal(
    basket(p, offers, true).find((i) => i.id === "chicken").offer,
    null,
  );
});

const manual = (extra = {}) => ({
  id: "manual-12345678",
  ingredient: "chicken",
  name: "Kyllingfilet",
  store: "Min butikk",
  price: 30,
  quantity: 400,
  validFrom: localDate(),
  validUntil: localDate(),
  member: false,
  sourceUrl: "",
  ...extra,
});
test("pantry is deducted once across the entire plan, with unchanged checks preserved", () => {
  const p = {
    ...emptyProfile(),
    plan: ["sticky-chicken", "crispy-wraps"],
    pantry: { chicken: 350 },
    checked: ["chicken", "oil"],
  };
  const before = basket(p, [], true),
    chicken = before.find((i) => i.id === "chicken");
  assert.equal(chicken.quantity, 700);
  assert.equal(chicken.need, 350);
  assert.equal(chicken.packs, 1);
  assert.equal(chicken.cost, 90);
  assert.equal(
    basketTotal(p, [], true),
    basketTotal({ ...p, checked: [] }, [], true),
  );
  p.pantry.chicken = 700;
  const after = basket(p, [], true),
    owned = after.find((i) => i.id === "chicken");
  assert.equal(owned.need, 0);
  assert.equal(owned.cost, 0);
  assert.equal(owned.packs, 0);
  assert.deepEqual(reconcileChecks(p, before, after), ["oil"]);
});
test("own offers work with stale source data, with date and membership checks", () => {
  const p = {
    ...emptyProfile(),
    plan: ["sticky-chicken"],
    manualOffers: [manual()],
  };
  assert.equal(basket(p, [], true).find((i) => i.id === "chicken").cost, 30);
  assert.equal(
    offerActive({ ...manual(), manual: true }, true, localDate()),
    true,
  );
  assert.equal(
    offerActive({ ...manual(), manual: true }, true, "2000-01-01"),
    false,
  );
  assert.equal(
    offerActive({ ...manual(), manual: true }, true, "2099-01-01"),
    false,
  );
  const raw = cleanOffers([
    {
      name: "Kyllingfilet",
      mengde: "400 g",
      price: "1",
      store: "A",
      valid_until: "2000-01-01",
    },
  ]);
  assert.equal(availableOffers(raw, emptyProfile(), false).length, 0);
  assert.equal(offerActive({ merknad: "Kun Trumf-medlemmer" }, false), false);
  assert.equal(localDate(new Date("2026-10-04T22:30:00Z")), "2026-10-05");
});
test("store choice compares total packages rather than number of offers", () => {
  const p = { ...emptyProfile(), plan: ["sticky-chicken"], maxStores: 1 };
  const offers = cleanOffers([
    { name: "Kyllingfilet", mengde: "400 g", price: "80", store: "A" },
    { name: "Kyllingfilet", mengde: "600 g", price: "90", store: "A" },
    { name: "Kyllingfilet", mengde: "400 g", price: "10", store: "B" },
  ]);
  assert.equal(
    basket(p, offers, false).find((i) => i.id === "chicken").offer.store_label,
    "B",
  );
  assert.equal(packageSize({ mengde: "600 g, kilopris 99" }, "g"), 600);
});
test("budget search lowers complete shopping cost and preserves locked meals", () => {
  const p = { ...emptyProfile(), days: 5 };
  const baseline = makePlan(p, [], true, 2);
  const before = basketTotal({ ...p, plan: baseline }, [], true);
  p.budget = 1;
  p.plan = baseline;
  p.locked = [0];
  const after = makePlan(p, [], true, 2);
  assert.equal(after[0], baseline[0]);
  assert.equal(after.length, 5);
  assert.ok(basketTotal({ ...p, plan: after }, [], true) < before);
  assert.ok(basketTotal({ ...p, plan: after }, [], true) > p.budget);
});
test("maximum time is a hard limit, even for a previously locked dinner", () => {
  const p = {
    ...emptyProfile(),
    days: 7,
    maxTime: 20,
    plan: [RECIPES.find((r) => r.time > 20).id],
    locked: [0],
  };
  const plan = makePlan(p, [], true, 3);
  assert.ok(plan.length > 0);
  assert.ok(plan.every((id) => RECIPES.find((r) => r.id === id).time <= 20));
});
test("custom recipes participate in planning, portions and durable validation", () => {
  const r = {
    id: "custom-12345678",
    title: "Min risrätt",
    time: 15,
    tip: "",
    tags: ["cheap", "vegetarian"],
    ingredients: [["rice", 200]],
    steps: ["Kok risen."],
  };
  const p = {
    ...emptyProfile(),
    customRecipes: [r],
    plan: [r.id],
    servings: 4,
    days: 1,
    locked: [0],
  };
  assert.ok(validCustomRecipe(r));
  assert.ok(validateProfile(p));
  assert.deepEqual(makePlan(p, [], true), [r.id]);
  assert.equal(basket(p, [], true).find((i) => i.id === "rice").quantity, 400);
  assert.equal(validCustomRecipe({ ...r, ingredients: [["rice", -1]] }), false);
  assert.equal(
    validCustomRecipe({
      ...r,
      ingredients: [
        ["rice", 1],
        ["rice", 2],
      ],
    }),
    false,
  );
  assert.equal(validManualOffer(manual({ validUntil: "2026-02-30" })), false);
  assert.equal(
    validManualOffer(manual({ sourceUrl: "javascript:alert(1)" })),
    false,
  );
  const old = emptyProfile();
  for (const key of [
    "customRecipes",
    "manualOffers",
    "pantry",
    "budget",
    "maxTime",
    "locked",
  ])
    delete old[key];
  assert.ok(validateProfile(old));
  assert.deepEqual(withDefaults(old).pantry, {});
});
