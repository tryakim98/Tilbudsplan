import { INGREDIENTS, GOALS } from "./recipes.js";
import {
  normalize,
  emptyProfile,
  staleData,
  price,
  cleanOffers,
  eligible,
  availableOffers,
  storePool,
  recipeScore,
  makePlan,
  basket,
  recipeEstimate,
  catalog,
  withDefaults,
  combinedOffers,
  offerActive,
  reconcileChecks,
  coverage,
} from "./engine.js";
import {
  localDate,
  validCustomRecipe,
  validManualOffer,
  validateProfile,
} from "./model.js";
import { chainInfo, comparison } from "./offers.js";
const $ = (id) => document.getElementById(id);
const html = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n) +
  " kr";
const amount = (n) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(n);
const s = {
  p: emptyProfile(),
  offers: [],
  meta: {},
  stale: true,
  key: "",
  revision: 0,
  dirty: false,
  saving: false,
  blocked: false,
  loading: true,
  view: "plan",
  recipe: null,
  variation: 0,
  source: "",
};
let saveTimer;
function status(text, error = false) {
  $("save-status").textContent = text;
  $("save-status").classList.toggle("error-text", error);
  $("retry-save").hidden = !error || s.blocked;
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => $("toast")?.classList.remove("is-visible"),
    3500,
  );
}
function rememberKey(key) {
  try {
    key
      ? localStorage.setItem("tilbudsplan:profile-key", key)
      : localStorage.removeItem("tilbudsplan:profile-key");
  } catch {
    /* personal link still works */
  }
}
async function api(method, body, key = s.key) {
  const response = await fetch("/api/profile", {
    method,
    signal: AbortSignal.timeout(12000),
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: "Bearer " + key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Serveren svarte ikke som forventet. Valgene er fortsatt på siden. Prøv igjen.",
    );
  }
  if (!response.ok) {
    const error = new Error(data.error || "Kunne ikke lagre");
    error.status = response.status;
    throw error;
  }
  return data;
}
function changed() {
  s.dirty = true;
  if (!s.key) {
    status("Ikke lagret ennå. Opprett en profil for å ta vare på valgene.");
    return;
  }
  if (s.blocked) {
    status(
      "En annen enhet har endret profilen. Eksporter valgene dine før du laster siden på nytt.",
      true,
    );
    return;
  }
  status("Lagrer endringene …");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
async function save() {
  if (!s.key || !s.dirty || s.saving || s.blocked) return;
  s.saving = true;
  s.dirty = false;
  const snapshot = JSON.parse(JSON.stringify(s.p));
  try {
    const result = await api("PUT", { data: snapshot, revision: s.revision });
    s.revision = result.revision;
    status(s.dirty ? "Lagrer de siste endringene …" : "Lagret i din kokebok");
  } catch (e) {
    s.dirty = true;
    // A response can be lost after the write succeeded. Confirm before retrying.
    let confirmed = false;
    try {
      const current = await api("GET");
      if (
        JSON.stringify(withDefaults(current.data)) === JSON.stringify(snapshot)
      ) {
        s.revision = current.revision;
        s.dirty = JSON.stringify(s.p) !== JSON.stringify(snapshot);
        confirmed = true;
        status(
          s.dirty ? "Lagrer de siste endringene …" : "Lagret i din kokebok",
        );
      } else if (current.revision !== s.revision) s.blocked = true;
    } catch {
      /* keep unsaved values */
    }
    if (!confirmed)
      status(
        s.blocked
          ? "Profilen er endret på en annen enhet. Last ned kokeboka før du laster siden på nytt."
          : "Kunne ikke bekrefte lagring. Valgene er fortsatt her. Prøv igjen.",
        true,
      );
  } finally {
    s.saving = false;
  }
  if (s.dirty && !s.blocked && $("retry-save").hidden) setTimeout(save, 100);
}
function view(name) {
  s.view = name;
  document
    .querySelectorAll(".view")
    .forEach((e) => e.classList.toggle("is-active", e.id === name + "-view"));
  document.querySelectorAll(".flow-tab").forEach((e) => {
    const active = e.dataset.view === name;
    e.classList.toggle("is-active", active);
    active
      ? e.setAttribute("aria-current", "page")
      : e.removeAttribute("aria-current");
  });
  render();
}
function syncControls() {
  $("meal-count").value = String(s.p.days);
  $("servings").value = String(s.p.servings);
  $("max-stores").value = String(s.p.maxStores);
  $("plan-mode").value = s.p.planMode;
  $("allow-repeats").checked = s.p.allowRepeats;
  $("budget-input").value = s.p.budget || "";
  $("max-time").value = String(s.p.maxTime);
  $("name-input").value = s.key ? s.p.name : "";
}
function counts() {
  $("profile-name").textContent = s.key ? s.p.name : "Prøv uten profil";
  $("name-submit").textContent = s.key ? "Lagre navn" : "Opprett profil";
  $("create-shortcut").hidden = !!s.key;
  $("personal-link").disabled = !s.key;
  $("plan-count-badge").textContent = s.p.plan.length;
  $("saved-count-badge").textContent = s.p.saved.length;
  $("selected-count-badge").textContent = s.p.selected.length;
  $("list-count-badge").textContent = basket(s.p, s.offers, s.stale).filter(
    (i) => i.need > 0 && !s.p.checked.includes(i.id),
  ).length;
}
function render() {
  counts();
  if (s.view === "plan") renderPlan();
  if (s.view === "offers") renderOffers();
  if (s.view === "list") renderList();
  if (s.view === "cookbook") renderBook();
  if (s.view === "profile") renderProfile();
  if (s.view === "pantry") renderPantry();
}
function tags(r) {
  return `<div class="meal-tags"><span class="meal-tag">${r.time} min</span>${r.tags
    .slice(0, 3)
    .map((t) => `<span class="meal-tag">${html(GOALS[t])}</span>`)
    .join("")}</div>`;
}
function scaledStep(step) {
  return step
    .replace(
      /(\d+(?:[.,]\d+)?)\s*(dl|ss) vann/g,
      (_, n, unit) =>
        amount((Number(n.replace(",", ".")) * s.p.servings) / 2) +
        " " +
        unit +
        " vann",
    )
    .replace("Lag fire groper", "Lag én grop til hvert egg");
}
function recipeActions(r) {
  return `<div class="recipe-actions"><button class="secondary-button" data-recipe="${r.id}">Se oppskrift</button><button class="save-button" data-save="${r.id}" aria-pressed="${s.p.saved.includes(r.id)}" aria-label="${s.p.saved.includes(r.id) ? "Fjern" : "Lagre"} ${html(r.title)}">${s.p.saved.includes(r.id) ? "♥ Lagret" : "♡ Lagre"}</button>${s.p.ratings[r.id] ? `<span class="rating-label">★ ${s.p.ratings[r.id]}/5</span>` : ""}</div>`;
}
function generate() {
  if (s.loading) {
    toast("Vent et øyeblikk mens profilen lastes.");
    return;
  }
  const locked = s.p.locked.map((i) => ({ id: s.p.plan[i], index: i }));
  mutatePlan(() => {
    s.p.plan = makePlan(s.p, s.offers, s.stale, ++s.variation);
    const positions = new Set();
    for (const { id, index } of locked) {
      const target =
        s.p.plan[index] === id && !positions.has(index)
          ? index
          : s.p.plan.findIndex((item, i) => item === id && !positions.has(i));
      if (target >= 0) positions.add(target);
    }
    s.p.locked = [...positions].sort((a, b) => a - b);
  });
  view("plan");
  if (s.p.plan.length < s.p.days)
    toast(
      "Færre retter passer. Prøv flere råvarer eller en høyere tidsgrense.",
    );
  else if (s.p.locked.length < locked.length)
    toast(
      "En låst middag falt ut på grunn av nye matvalg, tidsgrense eller færre middager.",
    );
}
function mutatePlan(change) {
  const before = basket(s.p, s.offers, s.stale);
  change();
  s.p.checked = reconcileChecks(s.p, before, basket(s.p, s.offers, s.stale));
  changed();
}
function offerComparison(o, compact = false) {
  const c = comparison(o);
  const before = !c.safe
    ? "<span>Førpris kan ikke sammenlignes</span>"
    : c.before
      ? `<span>Før <del>${money(c.before)}</del></span>`
      : "<span>Førpris ikke oppgitt</span>";
  const savings =
    c.before && c.safe
      ? `<strong class="discount">${money(c.before - c.current)} lavere · ${amount(c.discount)} %</strong>`
      : "";
  const history = c.history
    ? `<span>Tilbudssnitt siste 365 dager <strong>${money(c.history.mean)}</strong></span><small>${c.history.weeks} observerte uker · ${html(c.history.from)} til ${html(c.history.until)}</small>`
    : "<small>Tilbudssnitt: ingen tidligere sammenlignbare uker ennå.</small>";
  if (compact)
    return `<div class="used-comparison">${before}${savings}<span class="deal-rating ${c.level}">${html(c.rating)}</span>${c.history ? `<small>Tilbudssnitt ${money(c.history.mean)} · ${c.history.weeks} uker</small>` : ""}${!c.safe ? `<small>${html(c.reason)}</small>` : ""}</div>`;
  return `<div class="offer-comparison">${before}${savings}<div class="history-price">${history}</div><span class="deal-rating ${c.level}">${html(c.rating)}</span><details class="deal-basis"><summary>Grunnlag for vurderingen</summary><p>${html(c.explanation)}</p>${c.before ? `<p>${html(c.beforeSource)}. Dette er annonsens sammenligning, ikke en verifisert normalpris.</p>` : ""}${c.history ? `<p>Laveste observerte ukepris: ${money(c.history.min)}. Historikken gjelder tilbudspriser i samme kjede og pakning; ukene uten registrering er ukjente.</p>` : ""}${o.merknad ? `<p>Kilden oppgir: ${html(o.merknad)}</p>` : ""}</details></div>`;
}
function renderPlan() {
  const items = basket(s.p, s.offers, s.stale);
  const total = items.reduce((n, i) => n + i.cost, 0);
  const toBuy = items.filter((i) => i.need > 0);
  const covered = coverage(items);
  $("coverage-status").hidden = !s.p.plan.length;
  $("coverage-status").textContent =
    `${covered.offered} av ${covered.total} varer som må kjøpes har brukbar tilbudspris (${amount(covered.percent)} %). ${s.p.planMode === "offers" && covered.percent < 80 ? (s.stale ? "Felles tilbudsgrunnlag er gammelt. Legg inn gyldige egne tilbud eller oppdater kilden." : "Målet er minst 80 %. Det nås ikke med dagens retter og tilbud. Varene uten tilbud står i handlelisten.") : "Varer du har nok av hjemme er holdt utenfor andelen."}`;
  $("coverage-status").classList.toggle(
    "over-budget",
    s.p.planMode === "offers" && covered.percent < 80,
  );
  $("plan-empty").hidden = !!s.p.plan.length;
  $("plan-summary").hidden = !s.p.plan.length;
  $("plan-context").textContent = s.p.goals.length
    ? "Prioriterer: " +
      s.p.goals
        .map((t) => GOALS[t])
        .filter(Boolean)
        .join(" · ")
    : "Velg middager og porsjoner. Lås rettene du vil beholde før du lager en ny kombinasjon.";
  $("budget-status").hidden = !s.p.budget || !s.p.plan.length;
  $("budget-status").textContent =
    total > s.p.budget
      ? `Anslaget er ${money(total - s.p.budget)} over budsjettet på ${money(s.p.budget)}. Prøv en ny kombinasjon, færre middager eller lås opp noen retter. Budsjettet kan ikke alltid nås med valgene dine.`
      : `Anslaget er ${money(s.p.budget - total)} under budsjettet på ${money(s.p.budget)}. Endelig butikkpris kan avvike.`;
  $("budget-status").classList.toggle("over-budget", total > s.p.budget);
  $("plan-summary").innerHTML =
    `<div class="summary-stat"><span>Middager · ${s.p.servings} porsjoner</span><strong>${s.p.plan.length}</strong></div><div class="summary-stat"><span>Hele handleanslaget, etter det du har hjemme</span><strong>${money(total)}</strong></div><div class="summary-stat"><span>Råvarer med tilbudspris</span><strong>${toBuy.filter((i) => i.offer).length} av ${toBuy.length}</strong></div>`;
  $("meal-plan").innerHTML = s.p.plan
    .map((id, index) => {
      const r = catalog(s.p).find((r) => r.id === id);
      if (!r) return "";
      const matched = items
        .filter((i) => i.offer && r.ingredients.some(([iid]) => iid === i.id))
        .slice(0, 3);
      const locked = s.p.locked.includes(index);
      return `<article class="meal-card${locked ? " is-locked" : ""}"><div class="meal-day"><span>Middag</span><strong>${index + 1}</strong></div><div class="meal-copy"><h3>${html(r.title)}</h3><p>${html(r.tip || "Din egen hverdagsfavoritt")}</p>${tags(r)}${recipeActions(r)}${!eligible(r, s.p) ? '<p class="error-text">Passer ikke råvarevalgene eller tidsgrensen din. Bytt retten før du handler.</p>' : ""}</div><div class="meal-offers"><span>${matched.length ? "Tilbud i handlelisten" : "Vanlige råvarer og det du har hjemme"}</span>${matched.map((i) => `<div class="used-offer"><strong>${html(i.offer.name)}</strong><em>${html(i.offer.store_label)} · ${money(price(i.offer.price))}</em>${offerComparison(i.offer, true)}</div>`).join("")}<p class="small-note">Tilbud uten sikker mengde brukes ikke i anslaget. Sjekk lokal gyldighet.</p><button class="secondary-button lock-meal" data-lock="${index}" aria-pressed="${locked}">${locked ? "Låst · lås opp" : "Behold denne middagen"}</button><button class="swap-meal" data-swap="${index}" ${locked ? "disabled" : ""}>Bytt middag</button><button class="text-button" data-remove-meal="${index}">Ta ut</button></div></article>`;
    })
    .join("");
}
function renderOffers() {
  const all = combinedOffers(s.offers, s.p);
  const stores = [
    ...new Map([
      ...(s.meta.chains || []).map((c) => [c.key, c.label]),
      ...all.map((o) => [o.store_key, o.store_label]),
    ]).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "nb"));
  $("store-filters").innerHTML = stores
    .map(
      ([id, name]) =>
        `<label class="filter-check"><input type="checkbox" data-store="${html(id)}" ${s.p.stores.includes(id) ? "checked" : ""}><span>${html(name)}</span></label>`,
    )
    .join("");
  const query = normalize($("offer-search").value),
    sort = $("sort-offers").value;
  const rank = (o) => {
    const c = comparison(o);
    return c.safe && c.level !== "unknown" ? c.score : -Infinity;
  };
  const offers = all
    .filter(
      (o) =>
        (!s.p.stores.length || s.p.stores.includes(o.store_key)) &&
        (!query || normalize(o.name + " " + o.store_label).includes(query)),
    )
    .sort((a, b) =>
      sort === "value"
        ? rank(b) - rank(a)
        : sort === "price"
          ? (price(a.price) ?? Infinity) - (price(b.price) ?? Infinity)
          : sort === "store"
            ? a.store_label.localeCompare(b.store_label, "nb")
            : a.name.localeCompare(b.name, "nb"),
    );
  $("result-count").textContent =
    `${offers.length} tilbud som passer råvareregisteret · ${stores.length} kjeder i kilden`;
  $("history-summary").textContent = s.meta.historyWeeks
    ? `Prishistorikk: ${s.meta.historyWeeks} registrerte uker, fra ${String(s.meta.historyFrom).slice(0, 10)}. Årssammenligningen blir bedre etter hvert som flere uker legges til.`
    : "Prishistorikk er ikke tilgjengelig ennå. Vurderingen bruker oppgitt førpris der kilden har det.";
  $("offers-grid").innerHTML = offers.length
    ? offers
        .map((o) => {
          const c = comparison(o),
            active = offerActive(o, s.stale) && c.safe;
          const state = o.manual
            ? offerActive(o, s.stale)
              ? "Ditt tilbud"
              : "Utenfor dato"
            : s.stale
              ? "Arkiv"
              : offerActive(o, s.stale)
                ? "Sjekk gyldighet"
                : "Kan ikke brukes nå";
          return `<article class="offer-card${s.p.selected.includes(o.id) ? " is-selected" : ""}${s.p.excluded.includes(o.id) ? " is-excluded" : ""}"><div class="offer-flags"><span class="category-label">${html(o.category === "__top__" ? "Matvare" : o.category)}</span><span class="saving-label">${state}</span></div><h3 class="offer-title">${html(o.name)}</h3><p class="offer-quantity">${html((o.mengde || "Mengde ikke oppgitt").replace(/førpris.*$/i, "").trim())}</p><p class="offer-price">${c.current ? money(c.current) : html(o.price || "Ukjent pris")}</p><p class="offer-store">${html(o.store_label)}</p>${offerComparison(o)}${o.manual ? `<p class="small-note">${html(o.validFrom)} til ${html(o.validUntil)}${o.member ? " · Din medlemspris" : ""}${o.sourceUrl ? ` · <a href="${html(o.sourceUrl)}" target="_blank" rel="noreferrer">Se kilde</a>` : ""}</p>` : ""}<div class="offer-actions"><button class="choose-offer" data-offer="${html(o.id)}" ${!active ? "disabled" : ""} aria-pressed="${s.p.selected.includes(o.id)}">${s.p.selected.includes(o.id) ? "Prioritert ✓" : "Prioriter i planen"}</button><button class="exclude-offer" data-exclude="${html(o.id)}" aria-label="Ikke bruk ${html(o.name)}" aria-pressed="${s.p.excluded.includes(o.id)}">${s.p.excluded.includes(o.id) ? "↺" : "×"}</button></div>${o.manual ? `<button class="text-button" data-remove-offer="${o.id}">Slett mitt tilbud</button>` : ""}</article>`;
        })
        .join("")
    : '<div class="empty-state"><h3>Ingen tilbud passer</h3><p>Prøv et annet søk eller legg inn et tilbud fra en kjede.</p></div>';
}
function renderList() {
  const items = basket(s.p, s.offers, s.stale);
  const remaining = items.filter(
    (i) => i.need > 0 && !s.p.checked.includes(i.id),
  );
  $("shopping-overview").innerHTML =
    `<div class="shop-overview-card"><span>Gjenstår å handle</span><strong>${remaining.length} varer</strong></div><div class="shop-overview-card"><span>Hele handleanslaget</span><strong>${money(items.reduce((n, i) => n + i.cost, 0))}</strong></div><div class="shop-overview-card"><span>Gjenstår, anslag</span><strong>${money(remaining.reduce((n, i) => n + i.cost, 0))}</strong></div>`;
  const groups = new Map();
  for (const i of items) {
    const group =
      i.need === 0
        ? "Har nok hjemme"
        : i.offer
          ? "Tilbud · " + i.offer.store_label
          : i.group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(i);
  }
  $("shopping-list").innerHTML = items.length
    ? [...groups]
        .map(
          ([group, list]) =>
            `<section class="list-section"><h3>${html(group)}</h3><ul class="list-items">${list.map((i) => `<li class="shopping-item${s.p.checked.includes(i.id) ? " is-checked" : ""}${i.need === 0 ? " at-home" : ""}"><label>${i.need > 0 ? `<input type="checkbox" data-checked="${i.id}" aria-label="Har handlet ${html(i.name)}" ${s.p.checked.includes(i.id) ? "checked" : ""}>` : '<span aria-label="Har hjemme">✓</span>'}<span><strong>${html(i.name)}</strong><small>Til rettene: ${amount(i.quantity)} ${i.unit}${i.atHome ? ` · ${amount(i.atHome)} ${i.unit} hjemme` : ""}</small>${i.need > 0 ? `<small>Kjøp ${i.packs} × ${amount(i.size)} ${i.unit}${i.leftover ? ` · ${amount(i.leftover)} ${i.unit} til overs` : ""}</small>` : ""}${i.offer ? `<small>${html(i.offer.name)} · ${i.offer.manual ? "eget tilbud" : "sjekk gyldighet"}</small>` : ""}</span><span class="item-price">${money(i.cost)}<small>${i.need === 0 ? "Hjemme" : i.offer ? "Tilbudspris" : "Anslag"}</small></span></label></li>`).join("")}</ul></section>`,
        )
        .join("")
    : '<div class="empty-state"><h3>Ingen middager ennå</h3><p>Lag en ukeplan eller legg til retter fra kokeboka.</p><button class="primary-button" data-view="cookbook">Finn oppskrifter</button></div>';
}
function renderBook() {
  const q = normalize($("recipe-search").value),
    mode = $("book-mode").value,
    category = $("recipe-category").value,
    tonight = $("cook-tonight").checked;
  const missing = (r) =>
    r.ingredients.filter(
      ([id, n]) => (s.p.pantry[id] || 0) < (n * s.p.servings) / 2,
    ).length;
  const found = catalog(s.p).filter(
    (r) =>
      (!q ||
        normalize(
          r.title +
            " " +
            r.ingredients.map(([id]) => INGREDIENTS[id][0]).join(" "),
        ).includes(q)) &&
      (!category || r.tags.includes(category)) &&
      (!tonight || (eligible(r, s.p) && missing(r) <= 3)) &&
      (mode === "all" ||
        (mode === "saved" && s.p.saved.includes(r.id)) ||
        (mode === "rated" && s.p.ratings[r.id]) ||
        (mode === "favorites" && s.p.ratings[r.id] >= 4) ||
        (mode === "own" && r.id.startsWith("custom-"))),
  );
  if (tonight) found.sort((a, b) => missing(a) - missing(b));
  $("book-count").textContent =
    `${found.length} oppskrifter · ${s.p.saved.length} lagret${tonight ? " · mangler høyst tre råvarer til " + s.p.servings + " porsjoner" : ""}`;
  $("recipe-grid").innerHTML = found.length
    ? found
        .map(
          (r) =>
            `<article class="recipe-card"><div class="recipe-card-top"><span>${r.id.startsWith("custom-") ? "Din egen" : r.tags.includes("vegetarian") ? "Grønn middag" : "Hverdagsfavoritt"}</span><strong>${money(recipeEstimate(r, s.p.servings))}</strong></div><h3>${html(r.title)}</h3><p>${html(r.tip)}</p>${tags(r)}<p class="small-note">Anslått råvareforbruk for ${s.p.servings} porsjoner, ikke handlepris.</p>${tonight ? `<p class="pantry-match">${missing(r) ? `Mangler ${missing(r)} råvarer` : "Du har alt til denne"}</p>` : ""}${!eligible(r, s.p) ? '<p class="preference-warning">Passer ikke råvarevalgene eller tidsgrensen din</p>' : ""}${recipeActions(r)}<button class="text-button add-plan" data-add="${r.id}">Legg i ukeplanen</button></article>`,
        )
        .join("")
    : '<div class="empty-state"><h3>Ingen retter passer valgene</h3><p>Prøv et annet filter, legg til egne oppskrifter eller oppdater det du har hjemme.</p><button id="show-all-recipes" class="secondary-button">Vis alle oppskrifter</button></div>';
}
function renderProfile() {
  $("goal-options").innerHTML = Object.entries(GOALS)
    .map(
      ([id, label]) =>
        `<label class="choice-chip"><input type="checkbox" data-goal="${id}" ${s.p.goals.includes(id) ? "checked" : ""}><span>${label}</span></label>`,
    )
    .join("");
  const q = normalize($("ingredient-search").value);
  $("ingredient-options").innerHTML = Object.entries(INGREDIENTS)
    .filter(([, i]) => !q || normalize(i[0]).includes(q))
    .map(
      ([id, i]) =>
        `<div class="ingredient-choice"><strong>${html(i[0])}</strong><label><input type="checkbox" data-dislike="${id}" ${s.p.dislikes.includes(id) ? "checked" : ""}> Liker ikke</label><label><input type="checkbox" data-favorite="${id}" ${s.p.favorites.includes(id) ? "checked" : ""}> Favoritt</label></div>`,
    )
    .join("");
}
function openRecipe(id) {
  const r = catalog(s.p).find((r) => r.id === id);
  if (!r) return;
  s.recipe = id;
  const d = $("recipe-dialog");
  const rating = s.p.ratings[id] || 0;
  $("recipe-detail").innerHTML =
    `<p class="section-kicker">${r.time} minutter · ${s.p.servings} porsjoner</p><h2 id="recipe-title">${html(r.title)}</h2>${tags(r)}<div class="recipe-actions"><button class="save-button" data-save="${id}" aria-pressed="${s.p.saved.includes(id)}">${s.p.saved.includes(id) ? "♥ Lagret" : "♡ Lagre i kokeboka"}</button><button class="secondary-button" data-add="${id}">Legg i uka</button><button class="text-button" data-share-recipe="${id}">Del oppskrift</button>${id.startsWith("custom-") ? `<button class="text-button" data-edit-recipe="${id}">Rediger</button><button class="text-button" data-delete-recipe="${id}">Slett</button>` : ""}</div><div class="detail-columns"><section><h3>Ingredienser</h3><ul class="ingredients-list">${r.ingredients.map(([iid, n]) => `<li><span>${html(INGREDIENTS[iid][0])}</span><strong>${amount((n * s.p.servings) / 2)} ${INGREDIENTS[iid][1]}</strong></li>`).join("")}</ul><p class="small-note">Salt, pepper og vann etter behov.</p></section><section><h3>Slik gjør du</h3><ol class="steps">${r.steps.map((step) => `<li>${html(scaledStep(step))}</li>`).join("")}</ol></section></div><aside class="recipe-tip"><strong>Smaksgrepet</strong><p>${html(r.tip)}</p></aside><section class="my-recipe"><h3>Ville du laget den igjen?</h3><div class="stars" role="group" aria-label="Din vurdering">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" aria-label="Gi ${n} stjerner" aria-pressed="${rating === n}" class="${n <= rating ? "rated" : ""}">★</button>`).join("")}<span>${rating ? rating + "/5" : "Ikke vurdert"}</span></div><label for="recipe-note">Mine notater</label><textarea id="recipe-note" maxlength="3000" rows="3" placeholder="Litt mer sitron neste gang?">${html(s.p.notes[id] || "")}</textarea><button id="save-note" class="secondary-button">Lagre notat</button></section>`;
  if (!d.open) d.showModal();
}
function renderPantry() {
  const items = Object.entries(s.p.pantry)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) =>
      INGREDIENTS[a][0].localeCompare(INGREDIENTS[b][0], "nb"),
    );
  $("pantry-list").innerHTML = items.length
    ? items
        .map(
          ([id, n]) =>
            `<div class="pantry-row"><strong>${html(INGREDIENTS[id][0])}</strong><span>${amount(n)} ${INGREDIENTS[id][1]}</span><button class="text-button" data-edit-pantry="${id}">Endre</button><button class="text-button" data-remove-pantry="${id}" aria-label="Fjern ${html(INGREDIENTS[id][0])} fra det du har hjemme">Fjern</button></div>`,
        )
        .join("")
    : '<p class="empty-state">Legg til råvarer fra kjøleskapet, fryseren og skapet. Olje og krydder teller også.</p>';
}
function ingredientOptions(selected = "") {
  return Object.entries(INGREDIENTS)
    .sort(([, a], [, b]) => a[0].localeCompare(b[0], "nb"))
    .map(
      ([id, v]) =>
        `<option value="${id}" ${id === selected ? "selected" : ""}>${html(v[0])} (${v[1]})</option>`,
    )
    .join("");
}
function addIngredientRow(id = "rice", quantity = "") {
  if ($("custom-ingredients").children.length >= 40) {
    toast("Maks 40 råvarer per oppskrift.");
    return;
  }
  const row = document.createElement("div");
  row.className = "ingredient-row";
  row.innerHTML = `<label>Råvare<select class="custom-ingredient">${ingredientOptions(id)}</select></label><label>Mengde <span class="row-unit">(${INGREDIENTS[id][1]})</span><input class="custom-quantity" type="number" min="0.1" max="20000" step="0.1" required value="${quantity}"></label><button type="button" class="text-button" data-remove-ingredient aria-label="Fjern råvareraden">Fjern</button>`;
  row.querySelector("select").addEventListener("change", (e) => {
    row.querySelector(".row-unit").textContent =
      `(${INGREDIENTS[e.target.value][1]})`;
  });
  $("custom-ingredients").append(row);
  row.querySelector("select").value = id;
}
function openEditor(id) {
  const r = s.p.customRecipes.find((r) => r.id === id);
  $("recipe-form").reset();
  $("recipe-edit-id").value = r?.id || "";
  $("custom-title").value = r?.title || "";
  $("custom-time").value = r?.time || 30;
  $("custom-tip").value = r?.tip || "";
  $("custom-steps").value = r?.steps.join("\n") || "";
  $("custom-tags").innerHTML = Object.entries(GOALS)
    .map(
      ([key, label]) =>
        `<label class="choice-chip"><input type="checkbox" value="${key}" ${r?.tags.includes(key) ? "checked" : ""}><span>${label}</span></label>`,
    )
    .join("");
  $("custom-ingredients").innerHTML = "";
  for (const [iid, n] of r?.ingredients || [["rice", ""]])
    addIngredientRow(iid, n);
  $("recipe-error").textContent = "";
  $("recipe-dialog").close();
  $("editor-dialog").showModal();
}
function toggle(list, value) {
  s.p[list] = s.p[list].includes(value)
    ? s.p[list].filter((x) => x !== value)
    : [...s.p[list], value];
}
async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    $("copy-text").value = text;
    $("copy-dialog").showModal();
    $("copy-text").select();
  }
}
function exportProfile() {
  const data = { format: "tilbudsplan-kokebok", version: 1, profile: s.p };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "min-kokebok.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function createProfile(data) {
  clearTimeout(saveTimer);
  document.querySelector("main").inert = true;
  let result;
  try {
    result = await api("POST", data, "");
  } finally {
    document.querySelector("main").inert = false;
  }
  s.p = withDefaults(result.data);
  s.key = result.key;
  s.revision = result.revision;
  s.blocked = false;
  s.failedKey = "";
  s.dirty = false;
  rememberKey(s.key);
  history.replaceState(null, "", location.pathname + location.search);
  syncControls();
  status("Profil opprettet og lagret. Ta vare på din personlige lenke.");
  render();
}
async function loadData(force = false) {
  let data;
  for (const source of [
    "/api/offers" + (force ? "?refresh=1" : ""),
    "https://raw.githubusercontent.com/Olewol/tilbudsavis/main/latest-data.json",
    "/latest-data.json",
  ]) {
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(source.startsWith("/api/") ? 12000 : 5000),
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) continue;
      const candidate = await response.json();
      if (!Array.isArray(candidate.products)) continue;
      data = candidate;
      s.source = source.startsWith("/api/")
        ? "Tilbud med lagret prishistorikk"
        : source.startsWith("http")
          ? "Hentet fra kilden · historikk utilgjengelig"
          : "Lagret kopi";
      break;
    } catch {
      /* fallback */
    }
  }
  if (!data) {
    $("data-warning").textContent =
      "Tilbudene kunne ikke lastes. Kokeboka og middagsplanen virker fortsatt med prisanslag.";
    return;
  }
  const before = basket(s.p, s.offers, s.stale);
  s.meta = data.meta || {};
  if (!s.meta.chains)
    s.meta.chains = [
      ...new Map(
        data.products.map((o) => {
          const c = chainInfo(o);
          return [c.key, c];
        }),
      ).values(),
    ];
  s.offers = cleanOffers(data.products);
  s.stale = staleData(s.meta);
  const checked = reconcileChecks(s.p, before, basket(s.p, s.offers, s.stale));
  if (JSON.stringify(checked) !== JSON.stringify(s.p.checked)) {
    s.p.checked = checked;
    changed();
  }
  const date = new Date(s.meta.generated);
  const label = Number.isFinite(date.valueOf())
    ? date.toLocaleDateString("nb-NO")
    : "ukjent dato";
  $("source-updated").textContent =
    `${s.source} · uke ${s.meta.week || "ukjent"} · oppdatert ${label}.`;
  const warning = s.stale
    ? `Tilbudsgrunnlaget er gammelt (${label}). Det vises som arkiv og brukes ikke som dagens priser. Du kan fortsatt planlegge med tydelig merkede prisanslag.`
    : `Tilbudsgrunnlag fra ${label}. Sjekk dato, butikk og produkt i kundeavisen. Uten sikker pakningsstørrelse bruker vi et prisanslag i stedet.`;
  $("data-warning").textContent = s.meta.sourceError
    ? "Kilden kunne ikke oppdateres. Viser siste lagrede data. " + warning
    : warning;
  render();
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button");
  if (!b || s.loading) return;
  const d = b.dataset;
  extraClick(d, b);
  if (d.view) view(d.view);
  if (d.recipe) openRecipe(d.recipe);
  if (d.save) {
    toggle("saved", d.save);
    changed();
    render();
    if ($("recipe-dialog").open) openRecipe(d.save);
  }
  if (d.add) {
    const r = catalog(s.p).find((r) => r.id === d.add);
    if (!eligible(r, s.p)) {
      toast(
        "Retten inneholder noe du har valgt bort. Endre matprofilen hvis du vil bruke den.",
      );
      return;
    }
    if (s.p.plan.length >= 7) {
      toast("Ukeplanen har allerede sju middager. Ta ut en først.");
      return;
    }
    mutatePlan(() => s.p.plan.push(d.add));
    render();
    toast("Lagt i ukeplanen");
  }
  if (d.rate) {
    if (s.p.ratings[s.recipe] === Number(d.rate)) delete s.p.ratings[s.recipe];
    else s.p.ratings[s.recipe] = Number(d.rate);
    if (!s.p.saved.includes(s.recipe)) s.p.saved.push(s.recipe);
    changed();
    render();
    openRecipe(s.recipe);
  }
  if (d.offer) {
    toggle("selected", d.offer);
    s.p.excluded = s.p.excluded.filter((x) => x !== d.offer);
    changed();
    render();
  }
  if (d.exclude) {
    toggle("excluded", d.exclude);
    s.p.selected = s.p.selected.filter((x) => x !== d.exclude);
    changed();
    render();
  }
  if (d.swap !== undefined) {
    if (s.p.locked.includes(Number(d.swap))) return;
    const pool = storePool(availableOffers(s.offers, s.p, s.stale), s.p);
    const r = catalog(s.p)
      .filter((r) => eligible(r, s.p) && !s.p.plan.includes(r.id))
      .sort((a, b) => recipeScore(b, s.p, pool) - recipeScore(a, s.p, pool))[0];
    if (!r) {
      toast("Ingen flere retter passer preferansene.");
      return;
    }
    mutatePlan(() => {
      s.p.plan[Number(d.swap)] = r.id;
    });
    render();
  }
  if (d.removeMeal !== undefined) {
    const index = Number(d.removeMeal);
    mutatePlan(() => {
      s.p.plan.splice(index, 1);
      s.p.locked = s.p.locked
        .filter((i) => i !== index)
        .map((i) => (i > index ? i - 1 : i));
    });
    render();
  }
  if (d.shareRecipe) {
    const r = catalog(s.p).find((r) => r.id === d.shareRecipe);
    if (r.id.startsWith("custom-")) {
      const text =
        r.title +
        " · " +
        s.p.servings +
        " porsjoner\n" +
        r.ingredients
          .map(
            ([id, n]) =>
              amount((n * s.p.servings) / 2) +
              " " +
              INGREDIENTS[id][1] +
              " " +
              INGREDIENTS[id][0],
          )
          .join("\n") +
        "\n\n" +
        r.steps.map((step, i) => i + 1 + ". " + scaledStep(step)).join("\n") +
        "\n" +
        (r.tip || "");
      copy(
        text,
        "Oppskriften er kopiert. Lim den inn i en melding til en venn.",
      );
    } else
      copy(
        location.origin + location.pathname + "#oppskrift=" + r.id,
        "Oppskriftslenke kopiert, uten din profil",
      );
  }
  if (b.id === "show-all-recipes") {
    $("book-mode").value = "all";
    $("recipe-search").value = "";
    $("recipe-category").value = "";
    $("cook-tonight").checked = false;
    renderBook();
  }
});
function extraClick(d, b) {
  if (d.lock !== undefined) {
    toggle("locked", Number(d.lock));
    changed();
    render();
  }
  if (d.editPantry) {
    $("pantry-ingredient").value = d.editPantry;
    $("pantry-unit").textContent = "(" + INGREDIENTS[d.editPantry][1] + ")";
    $("pantry-quantity").value = s.p.pantry[d.editPantry];
    $("pantry-quantity").focus();
  }
  if (d.removePantry) {
    mutatePlan(() => delete s.p.pantry[d.removePantry]);
    render();
  }
  if (d.removeOffer) {
    mutatePlan(() => {
      s.p.manualOffers = s.p.manualOffers.filter((o) => o.id !== d.removeOffer);
      s.p.selected = s.p.selected.filter((id) => id !== d.removeOffer);
      s.p.excluded = s.p.excluded.filter((id) => id !== d.removeOffer);
    });
    render();
  }
  if (d.removeIngredient !== undefined) b.closest(".ingredient-row").remove();
  if (d.editRecipe) openEditor(d.editRecipe);
  if (
    d.deleteRecipe &&
    confirm(
      "Slette denne oppskriften? Den fjernes også fra ukeplanen, vurderingene og notatene.",
    )
  ) {
    mutatePlan(() => {
      const kept = s.p.plan
        .map((id, i) => ({ id, locked: s.p.locked.includes(i) }))
        .filter((x) => x.id !== d.deleteRecipe);
      s.p.plan = kept.map((x) => x.id);
      s.p.locked = kept.flatMap((x, i) => (x.locked ? [i] : []));
      s.p.customRecipes = s.p.customRecipes.filter(
        (r) => r.id !== d.deleteRecipe,
      );
      s.p.saved = s.p.saved.filter((id) => id !== d.deleteRecipe);
      delete s.p.ratings[d.deleteRecipe];
      delete s.p.notes[d.deleteRecipe];
    });
    $("recipe-dialog").close();
    render();
  }
}
document.addEventListener("change", (event) => {
  if (s.loading) return;
  const d = event.target.dataset;
  const before = basket(s.p, s.offers, s.stale);
  for (const [key, list] of [
    ["goal", "goals"],
    ["dislike", "dislikes"],
    ["favorite", "favorites"],
    ["store", "stores"],
    ["checked", "checked"],
  ]) {
    if (d[key]) {
      toggle(list, d[key]);
      if (key === "dislike")
        s.p.favorites = s.p.favorites.filter((x) => x !== d[key]);
      if (key === "favorite")
        s.p.dislikes = s.p.dislikes.filter((x) => x !== d[key]);
      if (key === "store")
        s.p.checked = reconcileChecks(
          s.p,
          before,
          basket(s.p, s.offers, s.stale),
        );
      changed();
      render();
    }
  }
});
for (const id of ["quick-plan", "generate-plan", "first-plan", "pantry-plan"])
  $(id).addEventListener("click", generate);
for (const [id, key] of [
  ["meal-count", "days"],
  ["servings", "servings"],
  ["max-stores", "maxStores"],
  ["max-time", "maxTime"],
  ["budget-input", "budget"],
])
  $(id).addEventListener("change", () => {
    if (s.loading) return;
    const value = Number($(id).value);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (key === "budget" && value > 10000)
    ) {
      syncControls();
      return;
    }
    mutatePlan(() => {
      s.p[key] = value;
    });
    if (key === "days") generate();
    else render();
  });
for (const id of ["offer-search", "sort-offers"])
  $(id).addEventListener("input", renderOffers);
for (const id of [
  "recipe-search",
  "recipe-category",
  "book-mode",
  "cook-tonight",
])
  $(id).addEventListener("input", renderBook);
$("ingredient-search").addEventListener("input", renderProfile);
$("close-recipe").addEventListener("click", () => $("recipe-dialog").close());
$("recipe-dialog").addEventListener("click", (e) => {
  if (e.target === $("recipe-dialog")) $("recipe-dialog").close();
  if (e.target.id === "save-note") {
    s.p.notes[s.recipe] = $("recipe-note").value;
    changed();
    toast(
      s.key ? "Notatet lagres" : "Notat lagt til. Opprett profil for å lagre.",
    );
  }
});
$("recipe-dialog").addEventListener("input", (e) => {
  if (e.target.id === "recipe-note") {
    s.p.notes[s.recipe] = e.target.value;
    changed();
  }
});
$("name-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (s.loading) return;
  const name = $("name-input").value.trim();
  if (!name) return;
  const button = $("name-submit");
  button.disabled = true;
  try {
    if (s.key) {
      s.p.name = name;
      changed();
      render();
    } else await createProfile({ ...s.p, name });
  } catch (error) {
    status(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$("personal-link").addEventListener("click", () => {
  if (s.key)
    copy(
      location.origin + location.pathname + "#profil=" + s.key,
      "Personlig lenke kopiert. Ikke del den med andre.",
    );
});
$("friend-link").addEventListener("click", () =>
  copy(
    location.origin + location.pathname,
    "App-lenke kopiert. Vennen lager sin egen profil.",
  ),
);
$("new-profile").addEventListener("click", () => {
  if (s.loading) return;
  if (
    (s.dirty || s.key) &&
    !confirm(
      "Ta vare på din personlige lenke først. Ulagrede endringer blir borte. Gå til en ny, tom profil?",
    )
  )
    return;
  if (s.saving) {
    toast("Vent til lagringen er ferdig.");
    return;
  }
  clearTimeout(saveTimer);
  s.p = emptyProfile();
  s.key = "";
  s.failedKey = "";
  history.replaceState(null, "", location.pathname + location.search);
  s.revision = 0;
  s.dirty = false;
  s.blocked = false;
  rememberKey("");
  syncControls();
  status("Ny profil. Skriv et navn for å lagre.");
  render();
});
$("export-profile").addEventListener("click", exportProfile);
$("import-profile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 350000) throw new Error("Filen er for stor");
    const data = JSON.parse(await file.text());
    if (
      data.format !== "tilbudsplan-kokebok" ||
      data.version !== 1 ||
      !data.profile
    )
      throw new Error("Dette er ikke en kokebok fra Tilbudsplan");
    if (!validateProfile(data.profile))
      throw new Error("Kokeboka inneholder ugyldige felt eller er for stor.");
    if (s.saving) throw new Error("Vent til lagringen er ferdig");
    if (
      !confirm(
        "Importer som en ny profil? Den gamle kokeboka beholdes med sin personlige lenke.",
      )
    )
      return;
    await createProfile(data.profile);
    toast("Kokeboka er importert som en ny profil");
  } catch (error) {
    toast(error.message);
  } finally {
    e.target.value = "";
  }
});
$("retry-save").addEventListener("click", () => {
  if (s.failedKey) {
    if (s.dirty) {
      toast(
        "Last ned kokeboka med valgene på denne siden før du laster inn profilen på nytt.",
      );
      return;
    }
    init(s.failedKey);
  } else save();
});
$("refresh-data").addEventListener("click", async () => {
  $("refresh-data").disabled = true;
  try {
    await loadData(true);
  } finally {
    $("refresh-data").disabled = false;
  }
});
$("clear-checked").addEventListener("click", () => {
  s.p.checked = [];
  changed();
  render();
});
$("copy-list").addEventListener("click", () => {
  const items = basket(s.p, s.offers, s.stale).filter(
    (i) => i.need > 0 && !s.p.checked.includes(i.id),
  );
  if (!items.length) {
    toast("Ingenting igjen på listen");
    return;
  }
  copy(
    "TILBUDSPLAN · " +
      s.p.servings +
      " porsjoner\n" +
      items
        .map(
          (i) =>
            `☐ ${i.name}: ${amount(i.need)} ${i.unit} mangler (kjøp ${i.packs} × ${amount(i.size)} ${i.unit}, ${money(i.cost)} ${i.offer ? "tilbud, sjekk gyldighet" : "anslag"})`,
        )
        .join("\n"),
    "Handlelisten er kopiert",
  );
});
function setupNewFeatures() {
  $("offer-week").addEventListener("click", () => {
    s.p.planMode = "offers";
    s.p.allowRepeats = true;
    s.p.days = 7;
    s.p.maxStores = 0;
    s.p.stores = [];
    syncControls();
    generate();
  });
  $("plan-mode").addEventListener("change", () => {
    s.p.planMode = $("plan-mode").value;
    changed();
    render();
  });
  $("allow-repeats").addEventListener("change", () => {
    s.p.allowRepeats = $("allow-repeats").checked;
    changed();
  });

  for (const prefix of ["pantry", "offer"]) {
    $(prefix + "-ingredient").innerHTML = ingredientOptions();
    const update = () => {
      $(prefix + "-unit").textContent =
        "(" + INGREDIENTS[$(prefix + "-ingredient").value][1] + ")";
    };
    $(prefix + "-ingredient").addEventListener("change", update);
    update();
  }
  $("offer-from").value = localDate();
  $("offer-until").value = localDate(new Date(Date.now() + 6 * 86400000));
  $("pantry-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (s.loading) return;
    const id = $("pantry-ingredient").value,
      n = Number($("pantry-quantity").value);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) return;
    mutatePlan(() => {
      if (n > 0) s.p.pantry[id] = n;
      else delete s.p.pantry[id];
    });
    render();
    toast("Mengden er oppdatert");
  });
  $("offer-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (s.loading) return;
    const offer = {
      id: "manual-" + crypto.randomUUID(),
      ingredient: $("offer-ingredient").value,
      name: $("offer-name").value.trim(),
      store: $("offer-store").value.trim(),
      price: Number($("offer-price").value),
      ...($("offer-before").value
        ? { beforePrice: Number($("offer-before").value) }
        : {}),
      quantity: Number($("offer-quantity").value),
      validFrom: $("offer-from").value,
      validUntil: $("offer-until").value,
      member: $("offer-member").checked,
      sourceUrl: $("offer-source").value.trim(),
    };
    if (!validManualOffer(offer)) {
      $("offer-error").textContent =
        "Kontroller pris, førpris, mengde og datoer. Førpris må være høyere enn tilbudspris. Sluttdato må være lik eller etter startdato.";
      return;
    }
    if (s.p.manualOffers.length >= 100) {
      $("offer-error").textContent =
        "Du har 100 egne tilbud. Slett noen utgåtte tilbud først.";
      return;
    }
    mutatePlan(() => {
      s.p.manualOffers.push(offer);
      if (s.p.stores.length && !s.p.stores.includes(chainInfo(offer).key))
        s.p.stores.push(chainInfo(offer).key);
    });
    $("offer-error").textContent = "";
    $("offer-name").value = "";
    $("offer-price").value = "";
    $("offer-before").value = "";
    $("offer-source").value = "";
    $("offer-member").checked = false;
    render();
    toast("Ditt tilbud er lagt til");
  });
  $("new-recipe").addEventListener("click", () => openEditor());
  $("add-ingredient").addEventListener("click", () => addIngredientRow());
  $("close-editor").addEventListener("click", () => {
    if (confirm("Lukke skjemaet uten å lagre oppskriften?"))
      $("editor-dialog").close();
  });
  $("editor-dialog").addEventListener("cancel", (e) => {
    if (!confirm("Lukke skjemaet uten å lagre oppskriften?"))
      e.preventDefault();
  });
  $("recipe-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const editing = $("recipe-edit-id").value;
    const ingredients = [...$("custom-ingredients").children].map((row) => [
      row.querySelector("select").value,
      Number(row.querySelector("input").value),
    ]);
    const recipe = {
      id: editing || "custom-" + crypto.randomUUID(),
      title: $("custom-title").value.trim(),
      time: Number($("custom-time").value),
      ingredients,
      steps: $("custom-steps")
        .value.split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      tip: $("custom-tip").value.trim(),
      tags: [...$("custom-tags").querySelectorAll("input:checked")].map(
        (x) => x.value,
      ),
    };
    if (!validCustomRecipe(recipe)) {
      $("recipe-error").textContent =
        "Bruk hver råvare én gang, med en positiv mengde. Oppskriften trenger navn, tid og 1–20 trinn (maks 2000 tegn per trinn).";
      return;
    }
    if (!editing && s.p.customRecipes.length >= 50) {
      $("recipe-error").textContent =
        "Kokeboka har plass til 50 egne oppskrifter. Slett en før du legger til flere.";
      return;
    }
    const updated = [
      ...s.p.customRecipes.filter((r) => r.id !== recipe.id),
      recipe,
    ];
    if (!validateProfile({ ...s.p, customRecipes: updated })) {
      $("recipe-error").textContent =
        "Kokeboka har blitt for stor. Last ned en kopi og fjern noen gamle notater eller oppskrifter.";
      return;
    }
    mutatePlan(() => {
      s.p.customRecipes = updated;
      if (!s.p.saved.includes(recipe.id)) s.p.saved.push(recipe.id);
    });
    $("editor-dialog").close();
    $("book-mode").value = "own";
    $("cook-tonight").checked = false;
    view("cookbook");
    openRecipe(recipe.id);
    toast(
      s.key
        ? "Oppskriften er lagt til og lagres"
        : "Oppskriften er lagt til. Opprett profil for å ta vare på den.",
    );
  });
  $("cook-tonight-button").addEventListener("click", () => {
    $("cook-tonight").checked = true;
    $("recipe-search").value = "";
    $("book-mode").value = "all";
    $("recipe-category").value = "";
    view("cookbook");
  });
  $("print-list").addEventListener("click", () => window.print());
  $("close-copy").addEventListener("click", () => {
    $("copy-dialog").close();
    $("copy-text").value = "";
  });
  $("copy-dialog").addEventListener("close", () => {
    $("copy-text").value = "";
  });
}
setupNewFeatures();
window.addEventListener("beforeunload", (e) => {
  if (s.dirty || s.saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function init(keyOverride) {
  s.loading = true;
  document.querySelector("main").inert = true;
  const params = new URLSearchParams(location.hash.slice(1));
  let key = keyOverride || params.get("profil");
  if (!key) {
    try {
      key = localStorage.getItem("tilbudsplan:profile-key");
    } catch {}
  }
  if (key) {
    try {
      const result = await api("GET", null, key);
      s.p = withDefaults(result.data);
      s.failedKey = "";
      s.key = key;
      s.revision = result.revision;
      rememberKey(key);
      history.replaceState(null, "", location.pathname + location.search);
      status("Kokeboka er lastet og klar");
    } catch (e) {
      s.failedKey = key;
      status(
        "Kokeboka kunne ikke lastes. Prøv igjen, eller start en ny profil. Den eksisterende profilen er ikke endret.",
        true,
      );
    }
  }
  s.loading = false;
  document.querySelector("main").inert = false;
  syncControls();
  $("recipe-category").innerHTML =
    '<option value="">Alle kategorier</option>' +
    Object.entries(GOALS)
      .map(([id, label]) => `<option value="${id}">${label}</option>`)
      .join("");
  render();
  if (params.get("oppskrift")) openRecipe(params.get("oppskrift"));
  await loadData();
}
init();
