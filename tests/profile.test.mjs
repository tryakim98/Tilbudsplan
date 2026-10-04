import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import worker, { validateProfile } from "../worker/index.js";
import { emptyProfile } from "../dist/engine.js";
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
    "navigator",
  ])
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? window : window[key],
      configurable: true,
    });
  globalThis.confirm = () => true;
  globalThis.fetch = async (url, opts = {}) =>
    String(url).includes("/api/profile")
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
  assert.equal(document.querySelectorAll(".recipe-card").length, 16);
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
  assert.equal(document.querySelectorAll(".meal-card").length, 5);
  assert.ok(!$("meal-plan").textContent.includes("Soyakylling"));
  click('[data-view="list"]');
  assert.ok(document.querySelectorAll(".shopping-item").length > 5);
  const check = document.querySelector("[data-checked]");
  check.checked = true;
  change(check);
  assert.ok(document.querySelector(".is-checked"));
  await wait(450);
  const saved = await (await api("GET", null, key)).json();
  assert.equal(saved.data.plan.length, 5);
  assert.equal(saved.data.checked.length, 1);
  assert.ok(saved.data.dislikes.includes("chicken"));
  await wait(3500);
  await window.happyDOM.close();
});
