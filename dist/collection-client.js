import { localDate } from "./model.js";
import { isLocalOffer } from "./locality.js";

const STORAGE_KEY = "tilbudsplan:collection-job";
const JOB_LIFETIME = 3600000;
export function canUsePartialCollection(data) {
  const c = data?.meta?.coverage;
  return !!(
    data?.status === "incomplete" &&
    data.meta?.localityVerified === true &&
    data.products?.length > 0 &&
    data.products.every(isLocalOffer) &&
    c?.catalogsTotal > 0 &&
    c.catalogsDone === c.catalogsTotal &&
    c.catalogs?.length === c.catalogsTotal &&
    c.catalogs.every(
      (r) =>
        r.done &&
        !r.error &&
        (r.localityVerified === true ||
          (r.unlocated === true && r.received === 0)),
    )
  );
}
export function isCompleteCollection(data) {
  const c = data?.meta?.coverage;
  return !!(
    data?.status === "complete" &&
    data.meta?.localityVerified === true &&
    data.products?.length > 0 &&
    data.products.every(isLocalOffer) &&
    c?.complete === true &&
    c.catalogsTotal > 0 &&
    c.catalogsDone === c.catalogsTotal &&
    c.catalogs?.length === c.catalogsTotal &&
    c.catalogs.every(
      (r) =>
        r.done &&
        r.localityVerified === true &&
        !r.error &&
        !r.unstructured &&
        Number.isInteger(r.expected) &&
        r.expected > 0 &&
        r.received === r.expected,
    )
  );
}
function tabStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// Only the current tab's collection credential is remembered. No profile data.
export function createOfferCollector({
  fetchImpl = (...args) => globalThis.fetch(...args),
  storage = tabStorage(),
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  let job = null;
  try {
    job = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
  } catch {}
  function remember(value) {
    job = value;
    try {
      if (value) storage?.setItem(STORAGE_KEY, JSON.stringify(value));
      else storage?.removeItem(STORAGE_KEY);
    } catch {}
  }
  function pending() {
    if (!job) return false;
    const age = now() - job.started;
    if (
      !/^[a-f0-9-]{36}$/.test(job.id || "") ||
      !/^[a-f0-9]{48}$/.test(job.key || "") ||
      !Number.isFinite(job.started) ||
      age < 0 ||
      age > JOB_LIFETIME ||
      localDate(new Date(job.started)) !== localDate(new Date(now()))
    ) {
      remember(null);
      return false;
    }
    return true;
  }
  async function call(path, method, key, onRetry, retries = 2) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetchImpl(path, {
          method,
          headers: {
            "content-type": "application/json",
            ...(key ? { authorization: "Bearer " + key } : {}),
          },
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(60000),
        });
        let data;
        try {
          data = await response.json();
        } catch {
          const error = new Error("Serveren svarte ikke som forventet.");
          error.status = response.status;
          throw error;
        }
        if (!response.ok || data.error) {
          const error = new Error(data.error || "Tilbudshentingen feilet.");
          error.status = response.status;
          throw error;
        }
        return data;
      } catch (error) {
        const retryable =
          !error.status ||
          error.status >= 500 ||
          [408, 429].includes(error.status);
        if (!retryable || attempt >= retries) throw error;
        onRetry?.(attempt + 1);
        await pause(1000 * (attempt + 1));
      }
    }
  }
  return {
    get pending() {
      return pending();
    },
    async collect({ force = false, onProgress, onRetry } = {}) {
      if (force) remember(null);
      let result;
      if (pending()) {
        try {
          result = await call(
            "/api/collection/" + job.id,
            "GET",
            job.key,
            onRetry,
          );
        } catch (error) {
          if (![401, 404].includes(error.status)) throw error;
          remember(null);
        }
      }
      if (!result) {
        // Retrying a step is safe; retrying creation could lose a second job key.
        result = await call(
          "/api/collection" + (force ? "?fresh=1" : ""),
          "POST",
          "",
          onRetry,
          0,
        );
        if (
          !/^[a-f0-9-]{36}$/.test(result.id || "") ||
          !/^[a-f0-9]{48}$/.test(result.key || "") ||
          !result.coverage
        )
          throw new Error("Innsamlingen kunne ikke startes. Prøv igjen.");
        remember({ id: result.id, key: result.key, started: now() });
      }
      const current = job;
      const started = now();
      try {
        if (result.coverage) onProgress?.(result);
        for (
          let i = 0;
          result.status === "collecting" || result.status === "busy";
          i++
        ) {
          if (i >= 2000 || now() - started >= 20 * 60000)
            throw new Error(
              "Hentingen tar for lang tid. Du kan fortsette den.",
            );
          if (result.status === "busy") await pause(1000);
          result = await call(
            "/api/collection/" + current.id + "/step",
            "POST",
            current.key,
            onRetry,
          );
          if (result.coverage) onProgress?.(result);
        }
        const data = Array.isArray(result.products)
          ? result
          : await call(
              "/api/collection/" + current.id,
              "GET",
              current.key,
              onRetry,
            );
        if (
          !Array.isArray(data.products) ||
          !data.meta?.coverage ||
          !["complete", "incomplete"].includes(data.status) ||
          data.meta.coverage.catalogsDone !== data.meta.coverage.catalogsTotal
        )
          throw new Error("Hentingen er ikke bekreftet avsluttet. Prøv igjen.");
        remember(null);
        return data;
      } catch (error) {
        if ([401, 404].includes(error.status)) remember(null);
        throw error;
      }
    },
  };
}
