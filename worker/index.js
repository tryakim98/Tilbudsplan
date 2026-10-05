import { validateProfile, withDefaults } from "../dist/model.js";
import { readOffers, refreshOffers } from "./offers.js";
export { validateProfile };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const validKey = (key) => /^[a-f0-9]{48}$/.test(key || "");
async function hash(key) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function db(env) {
  if (!env.DB) throw new Error("Storage binding unavailable");
  return env.DB;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/offers" && request.method === "GET") {
      try {
        const profileKey = request.headers
          .get("authorization")
          ?.replace(/^Bearer /, "");
        const canCollect =
          validKey(profileKey) &&
          !!(await db(env)
            .prepare("SELECT key_hash FROM profiles WHERE key_hash = ?")
            .bind(await hash(profileKey))
            .first());
        return json(
          await readOffers(
            env,
            typeof ASSETS === "undefined"
              ? null
              : JSON.parse(ASSETS["/latest-data.json"].body),
            url.searchParams.has("refresh"),
            new Date(),
            canCollect,
          ),
        );
      } catch (error) {
        console.error("Offer history unavailable", error.message);
        return json(
          { error: "Tilbudshistorikken kunne ikke lastes. Prøv igjen." },
          503,
        );
      }
    }
    if (url.pathname === "/api/offers/refresh") {
      if (request.method !== "POST")
        return json({ error: "Metoden støttes ikke" }, 405);
      const key = request.headers.get("authorization")?.replace(/^Bearer /, "");
      if (!env.OFFERS_UPDATE_KEY || key !== env.OFFERS_UPDATE_KEY)
        return json({ error: "Oppdatering krever tilgang" }, 401);
      try {
        return json(await refreshOffers(env));
      } catch (error) {
        console.error("Offer collection failed", error.message);
        return json(
          {
            error:
              "Kilden eller lagringen er utilgjengelig. Historikken er beholdt.",
          },
          503,
        );
      }
    }
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname !== "/api/profile")
        return json({ error: "Ukjent adresse" }, 404);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        return json({ error: "Ugyldig avsender" }, 403);
      try {
        if (request.method === "POST") {
          const key = [...crypto.getRandomValues(new Uint8Array(24))]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
          const body = await request.text();
          if (body.length > 250000)
            return json({ error: "Profilen er for stor" }, 413);
          const rawData = JSON.parse(body);
          const data =
            rawData && typeof rawData === "object"
              ? withDefaults(rawData)
              : rawData;
          if (!validateProfile(data))
            return json({ error: "Kontroller profilfeltene" }, 400);
          await db(env)
            .prepare(
              "INSERT INTO profiles (key_hash, data, revision, updated_at) VALUES (?, ?, 1, ?)",
            )
            .bind(
              await hash(key),
              JSON.stringify(data),
              new Date().toISOString(),
            )
            .run();
          return json({ key, data, revision: 1 }, 201);
        }
        const key = request.headers
          .get("authorization")
          ?.replace(/^Bearer /, "");
        if (!validKey(key))
          return json(
            { error: "Personlig lenke mangler eller er ugyldig" },
            401,
          );
        const keyHash = await hash(key);
        if (request.method === "GET") {
          const row = await db(env)
            .prepare("SELECT data, revision FROM profiles WHERE key_hash = ?")
            .bind(keyHash)
            .first();
          return row
            ? json({ data: JSON.parse(row.data), revision: row.revision })
            : json(
                {
                  error:
                    "Fant ikke kokeboken. Kontroller den personlige lenken.",
                },
                404,
              );
        }
        if (request.method === "PUT") {
          const raw = await request.text();
          if (raw.length > 250000)
            return json({ error: "Profilen er for stor" }, 413);
          const parsed = JSON.parse(raw);
          const revision = parsed?.revision;
          const data =
            parsed?.data && typeof parsed.data === "object"
              ? withDefaults(parsed.data)
              : parsed?.data;
          if (
            !validateProfile(data) ||
            !Number.isInteger(revision) ||
            revision < 1
          )
            return json({ error: "Kontroller profilfeltene" }, 400);
          const result = await db(env)
            .prepare(
              "UPDATE profiles SET data = ?, revision = revision + 1, updated_at = ? WHERE key_hash = ? AND revision = ?",
            )
            .bind(
              JSON.stringify(data),
              new Date().toISOString(),
              keyHash,
              revision,
            )
            .run();
          if (!result.meta.changes)
            return json(
              {
                error:
                  "Profilen er endret på en annen enhet. Last inn på nytt før du fortsetter. Eksporter gjerne endringene først.",
              },
              409,
            );
          return json({ revision: revision + 1 });
        }
        return json({ error: "Metoden støttes ikke" }, 405);
      } catch (error) {
        if (error instanceof SyntaxError)
          return json({ error: "Ugyldige data" }, 400);
        console.error("Profile storage failed", error.message);
        return json(
          {
            error:
              "Lagring er utilgjengelig akkurat nå. Endringene dine er fortsatt på denne siden. Prøv igjen.",
          },
          503,
        );
      }
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const asset = ASSETS[url.pathname === "/" ? "/index.html" : url.pathname];
    if (!asset) return new Response("Ikke funnet", { status: 404 });
    const body = asset.base64
      ? Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0))
      : asset.body;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": asset.type,
        "cache-control": "no-cache",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  },
};
