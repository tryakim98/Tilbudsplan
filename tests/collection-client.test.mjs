import test from "node:test";
import assert from "node:assert/strict";
import { createOfferCollector } from "../dist/collection-client.js";

const id = "11111111-1111-4111-8111-111111111111";
const key = "a".repeat(48);
const storageKey = "tilbudsplan:collection-job";
const instant = Date.parse("2026-10-06T08:00:00Z");
const coverage = {
  complete: true,
  catalogsDone: 2,
  catalogsTotal: 2,
  offersFetched: 12,
};
const result = {
  id,
  status: "complete",
  products: [{ id: "offer" }],
  meta: { coverage, collectionCompleted: new Date(instant).toISOString() },
};
function storage() {
  const values = new Map();
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name),
  };
}
const options = (memory, fetchImpl) => ({
  storage: memory,
  fetchImpl,
  pause: async () => {},
  now: () => instant,
});

test("lost step response retries the same job; a server lease never starts a second collection", async () => {
  const memory = storage();
  let starts = 0,
    steps = 0;
  const progress = [],
    retries = [];
  const client = createOfferCollector(
    options(memory, async (path, init) => {
      if (path === "/api/collection") {
        starts++;
        assert.equal(init.headers.authorization, undefined);
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
        if (steps === 1)
          throw new TypeError("Response lost after server write");
        if (steps === 2) return Response.json({ id, status: "busy" });
        return Response.json({ id, status: "complete", coverage });
      }
      return Response.json(result);
    }),
  );
  const data = await client.collect({
    onProgress: (r) => progress.push(r.coverage.catalogsDone),
    onRetry: (n) => retries.push(n),
  });
  assert.equal(starts, 1);
  assert.equal(steps, 3);
  assert.deepEqual(progress, [0, 2]);
  assert.deepEqual(retries, [1]);
  assert.deepEqual(data, result);
  assert.equal(client.pending, false);
  assert.equal(memory.getItem(storageKey), null);
});

test("interruption survives a page reload and resumes stored progress with the job credential", async () => {
  const memory = storage();
  let starts = 0,
    fail = true;
  const fetchImpl = async (path, init) => {
    if (path === "/api/collection") {
      starts++;
      return Response.json({ id, key, status: "collecting", coverage });
    }
    assert.equal(init.headers.authorization, "Bearer " + key);
    if (fail) return Response.json({ error: "Try again" }, { status: 503 });
    if (path.endsWith("/step"))
      return Response.json({ id, status: "complete", coverage });
    return Response.json(
      init.method === "GET" && starts === 1
        ? result
        : { id, status: "collecting", coverage },
    );
  };
  const firstPage = createOfferCollector(options(memory, fetchImpl));
  await assert.rejects(firstPage.collect(), /Try again/);
  assert.equal(firstPage.pending, true);
  assert.equal(JSON.parse(memory.getItem(storageKey)).id, id);
  fail = false;
  const reloadedPage = createOfferCollector(options(memory, fetchImpl));
  const data = await reloadedPage.collect();
  assert.equal(starts, 1);
  assert.deepEqual(data, result);
  assert.equal(memory.getItem(storageKey), null);
});

test("expired server jobs start once again; forced refresh discards pending work", async () => {
  const memory = storage();
  memory.setItem(storageKey, JSON.stringify({ id, key, started: instant }));
  const paths = [];
  const fetchImpl = async (path) => {
    paths.push(path);
    if (path === "/api/collection/" + id && paths.length === 1)
      return Response.json({ error: "Expired" }, { status: 401 });
    if (path.startsWith("/api/collection?") || path === "/api/collection")
      return Response.json({ id, key, status: "complete", coverage });
    return Response.json(result);
  };
  await createOfferCollector(options(memory, fetchImpl)).collect();
  assert.deepEqual(paths.slice(0, 2), [
    "/api/collection/" + id,
    "/api/collection",
  ]);
  paths.length = 0;
  memory.setItem(storageKey, JSON.stringify({ id, key, started: instant }));
  await createOfferCollector(options(memory, fetchImpl)).collect({
    force: true,
  });
  assert.equal(paths[0], "/api/collection?fresh=1");
  memory.setItem(
    storageKey,
    JSON.stringify({ id, key, started: instant - 7200000 }),
  );
  assert.equal(createOfferCollector(options(memory, fetchImpl)).pending, false);
  assert.equal(memory.getItem(storageKey), null);
});

test("resumption checks all flyers and preserves source gaps instead of claiming complete coverage", async () => {
  const memory = storage();
  memory.setItem(storageKey, JSON.stringify({ id, key, started: instant }));
  const incomplete = {
    ...result,
    status: "incomplete",
    meta: {
      ...result.meta,
      coverage: { ...coverage, complete: false, missing: 3 },
    },
  };
  const client = createOfferCollector(
    options(memory, async () => Response.json(incomplete)),
  );
  assert.deepEqual(await client.collect(), incomplete);
  assert.equal(client.pending, false);
  memory.setItem(storageKey, JSON.stringify({ id, key, started: instant }));
  const unfinished = {
    ...result,
    meta: { ...result.meta, coverage: { ...coverage, catalogsDone: 1 } },
  };
  const invalid = createOfferCollector(
    options(memory, async () => Response.json(unfinished)),
  );
  await assert.rejects(invalid.collect(), /ikke bekreftet avsluttet/);
  assert.equal(invalid.pending, true);
});
