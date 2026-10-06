import test from "node:test";
import assert from "node:assert/strict";
import {
  areaForStore,
  isLocalOffer,
  localOfferLabel,
} from "../dist/locality.js";
import {
  cleanOffers,
  availableOffers,
  emptyProfile,
  basket,
} from "../dist/engine.js";
import { planFromOffers } from "../dist/offer-planner.js";
import { INGREDIENTS } from "../dist/recipes.js";
import { localDate } from "../dist/model.js";
import { TEST_LOCALITY } from "./fixtures.mjs";

const remote = {
  verified: true,
  stores: [{ id: "oslo", area: "oslo", name: "Meny Oslo", city: "Oslo" }],
};
function priced(id, locality, price = 10) {
  const ingredient = INGREDIENTS[id];
  return {
    id: "locality-" + id + "-" + price,
    name: ingredient[5][0],
    store: "Meny",
    price,
    beforePrice: price * 2,
    structured: true,
    currency: "NOK",
    sourcePack: { quantity: ingredient[2], unit: ingredient[1] },
    validFrom: localDate(),
    validUntil: localDate(),
    locality,
  };
}

test("locality follows Norwegian postal town addresses, including the named nearby places", () => {
  for (const [city, area] of [
    ["FREDRIKSTAD", "fredrikstad"],
    ["Gamle fredrikstad", "fredrikstad"],
    ["Rolvsøy", "fredrikstad"],
    ["Kråkerøy", "fredrikstad"],
    ["Sarpsborg", "sarpsborg"],
    ["Borgenhaugen", "sarpsborg"],
    ["Grålum", "sarpsborg"],
    ["Mysen", "mysen"],
    ["Slitu", "mysen"],
  ])
    assert.equal(areaForStore({ city, country: { id: "NO" } }), area);
  for (const city of ["Bergen", "Oslo", "Askim", "Fredrikstad Oslo", "", null])
    assert.equal(
      areaForStore({ city, name: "Meny Fredrikstad", country: { id: "NO" } }),
      null,
    );
  assert.equal(
    areaForStore({ city: "Fredrikstad", country: { id: "SE" } }),
    null,
  );
  assert.equal(areaForStore({ city: "Fredrikstad" }), null);
});

test("unverified and remote offers cannot enter the pool even when the chain also has a local flyer", () => {
  const pool = availableOffers(
    cleanOffers([
      priced("chicken", TEST_LOCALITY, 40),
      priced("chicken", remote, 1),
      priced("chicken", undefined, 2),
      priced("chicken", { ...TEST_LOCALITY, verified: false }, 3),
    ]),
    emptyProfile(),
    false,
  );
  assert.deepEqual(
    pool.map((o) => o.price),
    [40],
  );
  assert.equal(
    isLocalOffer({
      locality: {
        verified: true,
        stores: [{ id: "fake", area: "fredrikstad", city: "Bergen" }],
      },
    }),
    false,
  );
  assert.equal(isLocalOffer({ manual: true }), true);
  assert.match(localOfferLabel(pool[0]), /Meny Fredrikstad/);
});

test("the complete plan and shopping basket use local package prices, not cheaper regional variants", () => {
  const ids = ["chicken", "rice", "soy", "honey", "garlic"];
  const p = {
    ...emptyProfile(),
    days: 1,
    budget: 500,
    pantry: { oil: 1000, salt: 1000, blackpepper: 1000 },
    customRecipes: [
      {
        id: "custom-12345678",
        title: "Lokal middag",
        time: 15,
        tags: [],
        tip: "",
        ingredients: ids.map((id) => [id, INGREDIENTS[id][2] / 2]),
        steps: ["Tilbered råvarene og server."],
      },
    ],
  };
  const offers = cleanOffers(
    ids.flatMap((id) => [priced(id, TEST_LOCALITY, 10), priced(id, remote, 1)]),
  );
  const result = planFromOffers(p, offers, false, 0);
  assert.equal(result.report.metTarget, true);
  p.plan = result.plan;
  p.generatedRecipes = result.generatedRecipes;
  const items = basket(p, offers, false).filter((i) => i.need > 0 && i.offer);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => isLocalOffer(i.offer) && i.offer.price === 10));
  assert.equal(
    basket({ ...p, plan: ["custom-12345678"] }, offers, false).reduce(
      (sum, i) => sum + i.cost,
      0,
    ),
    50,
  );
  const impossible = planFromOffers(
    p,
    cleanOffers(ids.map((id) => priced(id, remote, 1))),
    false,
    0,
  );
  assert.equal(
    impossible.report.metTarget,
    false,
    "remote discount must not satisfy the 80% target",
  );
});
