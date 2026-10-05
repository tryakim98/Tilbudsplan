export const normalizeText = (s = "") =>
  String(s)
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/g, " ")
    .trim();
export function parsePrice(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 ? value : null;
  const s = String(value ?? "").trim();
  if (!s || /%|for|fra|\//i.test(s)) return null;
  const m = s.match(
    /^(?:kr\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*[,.-]*\s*(?:kr)?)?$/i,
  );
  return m ? Number(m[1].replace(",", ".")) : null;
}
const CHAINS = [
  ["coopmarked", "Coop Marked", /^(?:coop )?marked\b/],
  ["coopmega", "Coop Mega", /^(?:coop )?mega\b/],
  ["coopprix", "Coop Prix", /^(?:coop )?prix\b/],
  ["obs", "Obs", /^(?:coop )?obs\b/],
  ["extra", "Extra", /^(?:coop )?extra\b/],
  ["rema", "Rema 1000", /^rema\b/],
  ["kiwi", "Kiwi", /^kiwi\b/],
  ["meny", "Meny", /^meny\b/],
  ["europris", "Europris", /^europris\b/],
  ["bunnpris", "Bunnpris", /^bunnpris\b/],
  ["eurospar", "Eurospar", /^eurospar\b/],
  ["spar", "Spar", /^spar\b/],
  ["joker", "Joker", /^joker\b/],
  ["narbutikken", "Nærbutikken", /^n[æa]rbutikken\b/],
  ["holdbart", "Holdbart", /^holdbart\b/],
];
export function chainInfo(o) {
  const fields =
    typeof o === "string" ? [o] : [o.store_key, o.store, o.store_label];
  for (const raw of fields) {
    const normalized = normalizeText(raw)
      .replace(/^coopmarked$/, "coop marked")
      .replace(/^coopmega$/, "coop mega")
      .replace(/^coopprix$/, "coop prix");
    const match = CHAINS.find(([, , pattern]) => pattern.test(normalized));
    if (match) return { key: match[0], label: match[1] };
  }
  const label =
    typeof o === "string"
      ? o
      : String(o.store || o.store_label || "Ukjent kjede")
          .replace(/[🚗#]/gu, "")
          .trim();
  return { key: normalizeText(label), label };
}
export function packInfo(o) {
  if (o.manual) return { quantity: o.quantity, unit: o.unit || null };
  const s = String(o.mengde || "")
    .replaceAll(",", ".")
    .toLowerCase()
    .split(/førpris|forpris/i)[0];
  if (/\d\s*[-–]\s*\d/.test(s)) return null;
  const multi = s.match(/\b(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|dl|l)\b/);
  if ([...s.matchAll(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|dl|l)\b/g)].length > 1)
    return null;
  const m = multi || s.match(/\b(\d+(?:\.\d+)?)\s*(kg|g|ml|dl|l)\b/);
  if (m) {
    const n = multi ? Number(m[1]) * Number(m[2]) : Number(m[1]),
      u = multi ? m[3] : m[2];
    return {
      quantity: n * { kg: 1000, g: 1, l: 1000, dl: 100, ml: 1 }[u],
      unit: ["kg", "g"].includes(u) ? "g" : "ml",
    };
  }
  if (/\b(?:pr\.?|per)\s*(?:kg|kilogram)\b/.test(s))
    return { quantity: 1000, unit: "g" };
  if (/\b(?:pr\.?|per)\s*(?:l|liter)\b/.test(s))
    return { quantity: 1000, unit: "ml" };
  const count = s.match(/\b(\d+)\s*[- ]?\s*(?:stk|pk|pakning)\b/);
  return count ? { quantity: Number(count[1]), unit: "stk" } : null;
}
export function priceBasis(o) {
  const current = parsePrice(o.price),
    pack = packInfo(o);
  if (o.manual) return { current, pack, safe: current > 0, reason: "" };
  const quoted = String(o.merknad || "").match(
    /(\d+(?:[.,]\d{1,2})?)\s*[,.-]*\s*\/\s*(kilogram|kg|liter|l|piece|stk)\b/i,
  );
  let safe = current > 0,
    reason = "";
  if (current && pack && quoted) {
    const unit = /kilogram|kg/i.test(quoted[2])
      ? "g"
      : /liter|^l$/i.test(quoted[2])
        ? "ml"
        : "stk";
    const q = Number(quoted[1].replace(",", "."));
    const calculated = (current / pack.quantity) * (unit === "stk" ? 1 : 1000);
    if (unit === pack.unit && q > 0 && Math.abs(calculated - q) / q > 0.04) {
      safe = false;
      reason =
        "Pris og oppgitt enhetspris stemmer ikke overens. Kontroller kundeavisen.";
    }
  }
  return { current, pack, safe, reason };
}
export function comparison(o, history = o.history) {
  const basis = priceBasis(o),
    current = basis.current;
  let before = parsePrice(o.beforePrice ?? o.original_price ?? o.before_price),
    beforeSource = before ? "Oppgitt førpris" : "";
  if (!before) {
    const m = String(o.mengde || "").match(
      /(?:førpris|forpris|før\s*:)\s*:?\s*(?:kr\s*)?(\d+(?:[.,]\d{1,2})?)/i,
    );
    if (m) {
      before = Number(m[1].replace(",", "."));
      beforeSource = "Oppgitt førpris";
    }
  }
  if (!before && current) {
    const m = String(o.merknad || "").match(
      /\bspar\s+(?:kr\s*)?(\d+(?:[.,]\d{1,2})?)/i,
    );
    if (m) {
      before = current + Number(m[1].replace(",", "."));
      beforeSource = "Utledet fra oppgitt «spar»";
    }
  }
  if (before && before <= current) {
    before = null;
    beforeSource = "";
  }
  const discount = before && current ? (1 - current / before) * 100 : null;
  const mean = history?.mean > 0 ? history.mean : null;
  const historicDiscount = mean && current ? (1 - current / mean) * 100 : null;
  let rating = "Rabatt ukjent",
    level = "unknown",
    score = 0,
    explanation =
      "Kilden oppgir ingen sammenlignbar førpris. Historikken bygges opp.";
  const reliableHistory = history?.weeks >= 4 && mean;
  const pct = reliableHistory ? historicDiscount : discount;
  if (!basis.safe) {
    rating = "Prisgrunnlag uklart";
    explanation = basis.reason || "Prisen kan ikke tolkes som en pakningspris.";
  } else if (pct !== null) {
    score = pct;
    if (pct >= 30) {
      rating = reliableHistory ? "Svært godt tilbud" : "Stor annonsert rabatt";
      level = "great";
    } else if (pct >= 15) {
      rating = reliableHistory ? "Godt tilbud" : "God annonsert rabatt";
      level = "good";
    } else if (pct > 2) {
      rating = reliableHistory
        ? "Litt under tilbudssnittet"
        : "Liten annonsert rabatt";
      level = "small";
    } else if (pct >= -2) {
      rating = "Omtrent på tilbudssnittet";
      level = "neutral";
    } else {
      rating = "Dyrere enn tilbudssnittet";
      level = "weak";
    }
    explanation = reliableHistory
      ? `Sammenlignet med ${history.weeks} observerte tilbudsuker i samme kjede og samme pakning siste 365 dager.`
      : "Vurdert mot annonsens førpris. Historikken er foreløpig for kort til å bekrefte hvor uvanlig prisen er.";
  }
  return {
    ...basis,
    before,
    beforeSource,
    discount,
    history: mean ? history : null,
    historicDiscount,
    rating,
    level,
    score,
    explanation,
  };
}
export function productKey(o) {
  const pack = packInfo(o);
  if (!pack || !priceBasis(o).safe || o.manual) return null;
  const descriptor = String(o.mengde || "")
    .split(/førpris|forpris/i)[0]
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|g|ml|dl|l|stk|pk)\b/gi, "")
    .replace(/(?:pr\.?|per)\s*(?:kg|kilogram|liter|l)\b/gi, "")
    .trim();
  return [
    normalizeText(o.name),
    normalizeText(descriptor),
    pack.unit,
    pack.quantity,
  ].join("|");
}
export function isoPeriod(date) {
  const d = new Date(String(date).slice(0, 10) + "T12:00:00Z");
  if (!Number.isFinite(d.valueOf())) return null;
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d - start) / 86400000 + 1) / 7);
  return year + "-W" + String(week).padStart(2, "0");
}
