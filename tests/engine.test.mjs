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
} from "../dist/engine.js";
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
  assert.equal(packageSize({ mengde: "2 x 400 g" }, "g"), null);
  assert.equal(packageSize({ mengde: "400–600 g" }, "g"), null);
  assert.equal(packageSize({ mengde: "1,5 kg" }, "g"), 1500);
});
test("no egg noodles as eggs or non-food as dinner", () => {
  assert.equal(ingredientOffer({ name: "Eggnudler" }, "eggs"), false);
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
