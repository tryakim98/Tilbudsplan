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
export function validateProfile(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 60
  )
    return false;
  for (const key of [
    "saved",
    "dislikes",
    "favorites",
    "goals",
    "plan",
    "checked",
    "selected",
    "excluded",
    "stores",
  ]) {
    if (
      !Array.isArray(data[key]) ||
      data[key].length > 500 ||
      data[key].some((x) => typeof x !== "string" || x.length > 300)
    )
      return false;
  }
  if (
    data.plan.length > 7 ||
    ![1, 2, 3, 4, 5, 6, 8].includes(data.servings) ||
    !Number.isInteger(data.days) ||
    data.days < 1 ||
    data.days > 7 ||
    ![1, 2, 3, 8].includes(data.maxStores)
  )
    return false;
  if (
    !data.ratings ||
    typeof data.ratings !== "object" ||
    Array.isArray(data.ratings) ||
    Object.values(data.ratings).some(
      (x) => !Number.isInteger(x) || x < 1 || x > 5,
    )
  )
    return false;
  if (
    !data.notes ||
    typeof data.notes !== "object" ||
    Array.isArray(data.notes) ||
    Object.values(data.notes).some(
      (x) => typeof x !== "string" || x.length > 3000,
    )
  )
    return false;
  return JSON.stringify(data).length < 80000;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
          if (body.length > 85000)
            return json({ error: "Profilen er for stor" }, 413);
          const data = JSON.parse(body);
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
          if (raw.length > 85000)
            return json({ error: "Profilen er for stor" }, 413);
          const { data, revision } = JSON.parse(raw);
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
