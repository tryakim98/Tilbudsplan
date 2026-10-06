import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import worker, { validateProfile } from "../worker/index.js";
import { emptyProfile } from "../dist/engine.js";
import { localDate } from "../dist/model.js";
import { RECIPES, INGREDIENTS } from "../dist/recipes.js";
function freshOffersFixture() {
  const products = Object.entries(INGREDIENTS)
    .filter(([, item]) => item[5].length)
    .map(([id, item]) => ({
      id: "fixture-" + id,
      name: item[5][0],
      price: item[3],
      beforePrice: item[3] * 1.5,
      store: "Meny",
      store_key: "meny",
      structured: true,
      currency: "NOK",
      sourcePack: { quantity: item[2], unit: item[1] },
      mengde: item[2] + " " + item[1],
      validFrom: localDate(),
      validUntil: localDate(),
    }));
  return { meta: { generated: new Date().toISOString(), week: 41 }, products };
}
const sql = new DatabaseSync(":memory:");
sql.exec(
  readFileSync(
    new URL("../drizzle/0000_worried_iron_man.sql", import.meta.url),
    "utf8",
  ),
);
const DB = {
  prepare(query) {
    return {
      bind(...values) {
        return {
          async run() {
            const r = sql.prepare(query).run(...values);
            return { meta: { changes: r.changes } };
          },
          async first() {
            return sql.prepare(query).get(...values) || null;
          },
        };
      },
    };
  },
};
async function api(method, data, key) {
  return worker.fetch(
    new Request("https://test.local/api/profile", {
      method,
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: "Bearer " + key } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    { DB },
  );
}
test("durable profile isolation, reload, validation and conflict prevention", async () => {
  const a = await (await api("POST", emptyProfile("A"))).json();
  const b = await (await api("POST", emptyProfile("B"))).json();
  assert.notEqual(a.key, b.key);
  a.data.saved = ["sticky-chicken"];
  a.data.ratings = { "sticky-chicken": 5 };
  assert.equal(
    (await api("PUT", { data: a.data, revision: 1 }, a.key)).status,
    200,
  );
  assert.equal(
    (await api("PUT", { data: a.data, revision: 1 }, a.key)).status,
    409,
  );
  const read = await (await api("GET", null, a.key)).json();
  assert.equal(read.data.ratings["sticky-chicken"], 5);
  assert.deepEqual(
    (await (await api("GET", null, b.key)).json()).data.saved,
    [],
  );
  assert.equal((await api("GET", null, "invalid")).status, 401);
  assert.equal(
    validateProfile({ ...emptyProfile(), ratings: { x: 99 } }),
    false,
  );
  const row = sql.prepare("SELECT key_hash FROM profiles LIMIT 1").get();
  assert.equal(row.key_hash.length, 64);
  assert.notEqual(row.key_hash, a.key);
});
test("UI: profile → saved recipe → rating → note → preferences → plan → list", async () => {
  const window = new Window({ url: "https://test.local/" });
  window.document.write(
    readFileSync(
      new URL("../dist/index.html", import.meta.url),
      "utf8",
    ).replace(/<script[^>]*>.*?<\/script>/gs, ""),
  );
  for (const key of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "navigator",
  ])
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? window : window[key],
      configurable: true,
    });
  globalThis.confirm = () => true;
  const offersFixture = freshOffersFixture();
  const completeCoverage = {
    complete: true,
    surveyedChains: 18,
    chainsWithFlyers: 9,
    catalogsTotal: 1,
    catalogsDone: 1,
    offersFetched: offersFixture.products.length,
    missing: 0,
    gaps: 0,
    catalogs: [
      {
        id: "test-catalog",
        chain: "Meny",
        title: "Testavis",
        expected: offersFixture.products.length,
        received: offersFixture.products.length,
        done: true,
        missing: 0,
      },
    ],
  };
  let sourceStatus = "complete",
    forcedCollection = false,
    collectionStarts = 0,
    releaseCollection = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("/api/collection")) {
      const coverage =
        sourceStatus === "complete"
          ? completeCoverage
          : {
              ...completeCoverage,
              complete: false,
              missing: 3,
              gaps: 1,
              catalogs: [{ ...completeCoverage.catalogs[0], missing: 3 }],
            };
      if (String(url).split("?")[0] === "/api/collection") {
        forcedCollection = String(url).includes("fresh=1");
        collectionStarts++;
        return Response.json({
          id: "11111111-1111-4111-8111-111111111111",
          key: "a".repeat(48),
          status: "collecting",
          coverage: { ...coverage, catalogsDone: 0 },
        });
      }
      if (String(url).endsWith("/step")) {
        if (releaseCollection) await releaseCollection;
        if (sourceStatus === "error")
          return Response.json({ error: "Kilden feilet" }, { status: 503 });
        return Response.json({
          id: "11111111-1111-4111-8111-111111111111",
          status: sourceStatus,
          coverage,
        });
      }
      return Response.json({
        ...offersFixture,
        id: "11111111-1111-4111-8111-111111111111",
        status: sourceStatus,
        meta: {
          ...offersFixture.meta,
          generated: new Date().toISOString(),
          coverage,
        },
      });
    }
    return String(url).includes("/api/profile")
      ? api(
          opts.method || "GET",
          opts.body ? JSON.parse(opts.body) : undefined,
          opts.headers?.authorization?.replace("Bearer ", ""),
        )
      : new Response(
          readFileSync(
            new URL("../dist/latest-data.json", import.meta.url),
            "utf8",
          ),
          { headers: { "content-type": "application/json" } },
        );
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const click = (selector) => {
    assert.ok(document.querySelector(selector), selector);
    document.querySelector(selector).click();
  };
  const change = (e) =>
    e.dispatchEvent(new window.Event("change", { bubbles: true }));
  await import("../dist/app.js");
  await wait(25);
  click('[data-view="profile"]');
  $("name-input").value = "Testkjøkken";
  $("name-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait(30);
  assert.equal($("profile-name").textContent, "Testkjøkken");
  click('[data-view="cookbook"]');
  assert.equal(
    document.querySelectorAll(".recipe-card").length,
    RECIPES.length,
  );
  click('[data-recipe="sticky-chicken"]');
  assert.ok($("recipe-detail").textContent.includes("Kyllingfilet"));
  click('[data-rate="5"]');
  $("recipe-note").value = "Mer sitron";
  $("recipe-note").dispatchEvent(new window.Event("input", { bubbles: true }));
  click("#save-note");
  click("#close-recipe");
  await wait(450);
  const key = localStorage.getItem("tilbudsplan:profile-key");
  const stored = await (await api("GET", null, key)).json();
  assert.equal(stored.data.notes["sticky-chicken"], "Mer sitron");
  assert.equal(stored.data.ratings["sticky-chicken"], 5);
  assert.ok(stored.data.saved.includes("sticky-chicken"));
  click('[data-view="profile"]');
  const chicken = document.querySelector('[data-dislike="chicken"]');
  chicken.checked = true;
  change(chicken);
  click("#quick-plan");
  await wait(100);
  assert.equal(document.querySelectorAll(".meal-card").length, 7);
  assert.equal($("weekly-shopping-cta").hidden, false);
  click("#open-weekly-list");
  assert.ok($("list-view").classList.contains("is-active"));
  assert.ok($("list-week-summary").textContent.includes("7 middager"));
  assert.ok(!$("meal-plan").textContent.includes("Soyakylling"));
  click('[data-view="list"]');
  assert.ok(document.querySelectorAll(".shopping-item").length > 5);
  const check = document.querySelector("[data-checked]");
  check.checked = true;
  change(check);
  assert.ok(document.querySelector(".is-checked"));
  await wait(450);
  const saved = await (await api("GET", null, key)).json();
  assert.equal(saved.data.plan.length, 7);
  assert.equal(saved.data.checked.length, 1);
  assert.ok(saved.data.dislikes.includes("chicken"));
  const generatedId = saved.data.plan.find((id) => id.startsWith("offer-"));
  assert.ok(generatedId);
  click('[data-view="plan"]');
  click('[data-recipe="' + generatedId + '"]');
  click('[data-rate="4"]');
  $("recipe-note").value = "Denne tilbudsretten vil jeg beholde";
  $("recipe-note").dispatchEvent(new window.Event("input", { bubbles: true }));
  click("#save-note");
  click("#close-recipe");
  await wait(450);
  const keptRecipe = (await (await api("GET", null, key)).json()).data;
  assert.ok(keptRecipe.saved.includes(generatedId));
  assert.equal(keptRecipe.ratings[generatedId], 4);
  assert.equal(
    keptRecipe.notes[generatedId],
    "Denne tilbudsretten vil jeg beholde",
  );
  assert.ok(
    keptRecipe.generatedRecipes.find((r) => r.id === generatedId).steps
      .length >= 4,
  );
  const submit = (id) =>
    $(id).dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  click('[data-view="pantry"]');
  $("pantry-ingredient").value = "rice";
  change($("pantry-ingredient"));
  $("pantry-quantity").value = "150";
  submit("pantry-form");
  assert.ok($("pantry-list").textContent.includes("150"));
  click('[data-view="cookbook"]');
  click("#new-recipe");
  $("custom-title").value = "Restepanne";
  $("custom-time").value = "15";
  document.querySelector(".custom-quantity").value = "200";
  click("#add-ingredient");
  const rows = document.querySelectorAll(".ingredient-row");
  rows[1].querySelector("select").value = "eggs";
  rows[1].querySelector("input").value = "2";
  $("custom-steps").value = "Kok risen.\nStek eggene og bland.";
  submit("recipe-form");
  assert.equal($("recipe-error").textContent, "");
  const customId =
    document.querySelector("[data-edit-recipe]").dataset.editRecipe;
  assert.ok($("recipe-detail").textContent.includes("Restepanne"));
  click("#close-recipe");
  click('[data-view="plan"]');
  click('[data-remove-meal="0"]');
  click('[data-view="cookbook"]');
  click('[data-recipe="' + customId + '"]');
  click('[data-add="' + customId + '"]');
  click("#close-recipe");
  click('[data-view="plan"]');
  while (document.querySelectorAll(".meal-card").length > 1)
    click('[data-remove-meal="0"]');
  click('[data-lock="0"]');
  $("budget-input").value = "1";
  change($("budget-input"));
  $("max-time").value = "20";
  change($("max-time"));
  $("meal-count").value = "3";
  change($("meal-count"));
  await wait(100);
  assert.equal(
    document.querySelector(".meal-copy h3").textContent,
    "Restepanne",
  );
  assert.ok($("budget-status").textContent.includes("over budsjettet"));
  const retainedPlan = $("meal-plan").innerHTML;
  click("#generate-plan");
  await wait(100);
  assert.equal($("meal-plan").innerHTML, retainedPlan);
  assert.ok(
    $("planning-feedback").textContent.includes(
      "Den eksisterende planen er beholdt",
    ),
  );
  click('[data-view="offers"]');
  $("offer-ingredient").value = "rice";
  $("offer-name").value = "Rispose";
  $("offer-store").value = "Nærbutikken";
  $("offer-price").value = "5";
  $("offer-before").value = "20";
  $("offer-quantity").value = "200";
  $("offer-from").value = localDate();
  $("offer-until").value = localDate();
  submit("offer-form");
  assert.equal($("offer-error").textContent, "");
  $("offer-search").value = "Rispose";
  $("offer-search").dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.ok($("offers-grid").textContent.includes("Rispose"));
  assert.ok($("offers-grid").textContent.includes("75 %"));
  $("offer-search").value = "";
  $("offer-search").dispatchEvent(new window.Event("input", { bubbles: true }));
  click('[data-view="list"]');
  assert.ok(
    $("shopping-list").textContent.includes("Rispose"),
    $("shopping-list").textContent,
  );
  const allTotal =
    $("shopping-overview").querySelectorAll("strong")[1].textContent;
  const item = document.querySelector("[data-checked]");
  item.checked = true;
  change(item);
  assert.equal(
    $("shopping-overview").querySelectorAll("strong")[1].textContent,
    allTotal,
  );
  await wait(500);
  const revised = await (await api("GET", null, key)).json();
  assert.equal(revised.data.customRecipes[0].id, customId);
  assert.equal(revised.data.plan[0], customId);
  assert.deepEqual(revised.data.locked, [0]);
  assert.equal(revised.data.pantry.rice, 150);
  assert.equal(revised.data.manualOffers[0].price, 5);
  assert.equal(revised.data.manualOffers[0].beforePrice, 20);
  assert.equal(revised.data.budget, 1);
  assert.equal(revised.data.maxTime, 20);
  assert.ok($("save-status").textContent.includes("Lagret"));

  // Lost PUT responses must not strand a profile in a false conflict.
  const normalFetch = globalThis.fetch;
  let loseResponse = true;
  globalThis.fetch = async (url, opts = {}) => {
    const result = await normalFetch(url, opts);
    if (opts.method === "PUT" && loseResponse) {
      loseResponse = false;
      throw new Error("Simulated lost response after committed write");
    }
    return result;
  };
  click('[data-recipe="' + customId + '"]');
  $("recipe-note").value = "Et notat som skal tåle tapt svar";
  $("recipe-note").dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(500);
  assert.ok($("save-status").textContent.includes("Lagret"));
  assert.equal(
    (await (await api("GET", null, key)).json()).data.notes[customId],
    "Et notat som skal tåle tapt svar",
  );

  // Edits made during a write remain queued and cannot be called saved early.
  let release,
    started = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (url, opts = {}) => {
    const result = await normalFetch(url, opts);
    if (opts.method === "PUT" && !started) {
      started = true;
      await gate;
    }
    return result;
  };
  $("recipe-note").value = "Første endring";
  $("recipe-note").dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(400);
  assert.ok(started);
  $("recipe-note").value = "Siste endring";
  $("recipe-note").dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.ok(!$("save-status").textContent.includes("Lagret"));
  release();
  await wait(500);
  assert.equal(
    (await (await api("GET", null, key)).json()).data.notes[customId],
    "Siste endring",
  );
  assert.ok($("save-status").textContent.includes("Lagret"));
  globalThis.fetch = normalFetch;
  click("#close-recipe");
  click('[data-view="plan"]');
  $("budget-input").value = "1500";
  change($("budget-input"));
  $("max-time").value = "0";
  change($("max-time"));
  click("#offer-week");
  assert.equal($("meal-count").value, "7");
  assert.equal($("max-stores").value, "0");
  assert.equal($("plan-mode").value, "luxury");
  assert.equal($("allow-repeats").checked, false);
  await wait(500);
  // CPU-bound planning can finish after the initial timer was due; wait for the subsequent save debounce.
  await wait(450);
  const week = (await (await api("GET", null, key)).json()).data;
  assert.equal(week.plan.length, 7, $("planning-feedback").textContent);
  assert.equal(week.planMode, "luxury");
  assert.equal(week.allowRepeats, false);
  assert.deepEqual(week.stores, []);
  assert.deepEqual(week.locked, [0]);
  $("allow-repeats").checked = false;
  change($("allow-repeats"));
  await wait(500);
  assert.equal(
    (await (await api("GET", null, key)).json()).data.allowRepeats,
    false,
  );
  click("#refresh-data");
  await wait(100);
  assert.equal(forcedCollection, true);
  // All pages must finish before planning. Metadata gaps are disclosed and do not strand the user.
  const prior = $("meal-plan").innerHTML;
  let finish;
  releaseCollection = new Promise((resolve) => {
    finish = resolve;
  });
  const starts = collectionStarts;
  click("#generate-plan");
  await wait(25);
  assert.equal(collectionStarts, starts + 1);
  assert.equal($("meal-plan").innerHTML, prior);
  assert.equal($("generate-plan").disabled, true);
  sourceStatus = "incomplete";
  finish();
  releaseCollection = null;
  await wait(100);
  assert.equal($("partial-plan").hidden, true);
  assert.ok($("collection-status").textContent.includes("ufullstendig"));
  await wait(500);
  assert.ok($("plan-data-basis").textContent.includes("ufullstendig"));
  const partialPlan = $("meal-plan").innerHTML;
  sourceStatus = "error";
  click("#generate-plan");
  await wait(3200);
  assert.equal($("meal-plan").innerHTML, partialPlan);
  assert.equal($("partial-plan").hidden, true);
  assert.ok($("collection-status").textContent.includes("ingen ny plan"));
  assert.equal($("resume-collection").hidden, false);
  const interruptedStarts = collectionStarts;
  sourceStatus = "incomplete";
  click("#resume-collection");
  await wait(100);
  assert.equal(collectionStarts, interruptedStarts);
  assert.equal($("resume-collection").hidden, true);
  assert.equal($("partial-plan").hidden, false);
  assert.ok(
    $("collection-next").textContent.includes("kildens oppgitte antall") ||
      $("collection-next").textContent.includes("Kildens oppgitte antall"),
  );
  assert.equal(sessionStorage.getItem("tilbudsplan:collection-job"), null);
  await window.happyDOM.close();
});

test("UI: reload resumes unfinished collection; an older partial result is rechecked before planning", async () => {
  const window = new Window({ url: "https://test.local/" });
  window.document.write(
    readFileSync(
      new URL("../dist/index.html", import.meta.url),
      "utf8",
    ).replace(/<script[^>]*>.*?<\/script>/gs, ""),
  );
  for (const name of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "navigator",
  ])
    Object.defineProperty(globalThis, name, {
      value: name === "window" ? window : window[name],
      configurable: true,
    });
  const fixture = freshOffersFixture();
  const id = "22222222-2222-4222-8222-222222222222";
  const key = "b".repeat(48);
  sessionStorage.setItem(
    "tilbudsplan:collection-job",
    JSON.stringify({ id, key, started: Date.now() - 600000 }),
  );
  const coverage = {
    complete: false,
    surveyedChains: 2,
    chainsWithFlyers: 1,
    catalogsTotal: 1,
    catalogsDone: 1,
    offersFetched: fixture.products.length,
    missing: 3,
    gaps: 1,
    catalogs: [
      {
        chain: "Meny",
        title: "Testavis",
        expected: fixture.products.length + 3,
        received: fixture.products.length,
        done: true,
        missing: 3,
      },
    ],
  };
  let starts = 0,
    steps = 0,
    reads = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const finished = () => ({
    ...fixture,
    id,
    status: "incomplete",
    meta: {
      ...fixture.meta,
      coverage,
      generated: new Date(Date.now() - (starts ? 0 : 600000)).toISOString(),
      collectionCompleted: new Date(
        Date.now() - (starts ? 0 : 600000),
      ).toISOString(),
    },
  });
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/offers") return Response.json(finished());
    if (path === "/api/collection") {
      starts++;
      return Response.json({
        id,
        key,
        status: "collecting",
        coverage: { ...coverage, catalogsDone: 0 },
      });
    }
    assert.equal(init.headers.authorization, "Bearer " + key);
    if (path.endsWith("/step")) {
      steps++;
      if (steps === 1) await gate;
      return Response.json({ id, status: "incomplete", coverage });
    }
    reads++;
    return Response.json(
      reads === 1
        ? {
            id,
            status: "collecting",
            coverage: { ...coverage, catalogsDone: 0 },
          }
        : finished(),
    );
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await import("../dist/app.js?reload-flow");
  await wait(50);
  assert.equal(starts, 0);
  assert.equal(steps, 1);
  assert.equal(document.getElementById("generate-plan").disabled, true);
  assert.equal(document.getElementById("partial-plan").hidden, true);
  assert.equal(document.getElementById("collection-activity").hidden, false);
  assert.equal(document.querySelectorAll(".meal-card").length, 0);
  release();
  await wait(80);
  assert.equal(document.getElementById("generate-plan").disabled, false);
  assert.equal(document.getElementById("collection-activity").hidden, true);
  assert.equal(document.getElementById("partial-plan").hidden, false);
  assert.equal(sessionStorage.getItem("tilbudsplan:collection-job"), null);
  document.getElementById("partial-plan").click();
  await wait(100);
  assert.equal(starts, 1, "older data must trigger a fresh coverage check");
  assert.equal(steps, 2);
  assert.equal(document.querySelectorAll(".meal-card").length, 7);
  assert.ok(
    document
      .getElementById("plan-data-basis")
      .textContent.includes("ufullstendig"),
  );
  await window.happyDOM.close();
});
