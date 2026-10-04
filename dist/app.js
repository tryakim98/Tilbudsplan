import { INGREDIENTS, RECIPES, GOALS } from "./recipes.js";
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
  ingredientOffer,
} from "./engine.js";
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
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) +
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
    () => $("toast").classList.remove("is-visible"),
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
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: "Bearer " + key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
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
    status("Lagret i din kokebok");
  } catch (e) {
    s.dirty = true;
    s.blocked = e.status === 409;
    status(e.message, true);
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
  $("meal-count").value = s.p.days;
  $("servings").value = s.p.servings;
  $("max-stores").value = s.p.maxStores;
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
  $("list-count-badge").textContent = basket(s.p, s.offers, s.stale).length;
}
function render() {
  counts();
  if (s.view === "plan") renderPlan();
  if (s.view === "offers") renderOffers();
  if (s.view === "list") renderList();
  if (s.view === "cookbook") renderBook();
  if (s.view === "profile") renderProfile();
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
  s.p.plan = makePlan(s.p, s.offers, s.stale, ++s.variation);
  s.p.checked = [];
  changed();
  view("plan");
  if (s.p.plan.length < s.p.days)
    toast("Færre retter passer preferansene. Prøv å tillate flere råvarer.");
}
function renderPlan() {
  const pool = storePool(availableOffers(s.offers, s.p, s.stale), s.p);
  const items = basket(s.p, s.offers, s.stale);
  $("plan-empty").hidden = !!s.p.plan.length;
  $("plan-summary").hidden = !s.p.plan.length;
  $("plan-context").textContent = s.p.goals.length
    ? "Prioriterer: " +
      s.p.goals
        .map((t) => GOALS[t])
        .filter(Boolean)
        .join(" · ")
    : "Velg antall middager og porsjoner. Matprofilen din styrer forslagene.";
  $("plan-summary").innerHTML =
    `<div class="summary-stat"><span>Middager · ${s.p.servings} porsjoner</span><strong>${s.p.plan.length}</strong></div><div class="summary-stat"><span>Handleanslag, hele pakninger</span><strong>${money(items.filter((i) => !s.p.checked.includes(i.id)).reduce((n, i) => n + i.cost, 0))}</strong></div><div class="summary-stat"><span>Råvarer med tilbudspris*</span><strong>${items.filter((i) => i.offer).length} av ${items.length}</strong></div>`;
  $("meal-plan").innerHTML = s.p.plan
    .map((id, index) => {
      const r = RECIPES.find((r) => r.id === id);
      if (!r) return "";
      const matched = r.ingredients
        .flatMap(([iid]) =>
          pool.filter((o) => ingredientOffer(o, iid)).slice(0, 1),
        )
        .slice(0, 3);
      return `<article class="meal-card"><div class="meal-day"><span>Middag</span><strong>${index + 1}</strong></div><div class="meal-copy"><h3>${html(r.title)}</h3><p>${html(r.tip)}</p>${tags(r)}${recipeActions(r)}${!eligible(r, s.p) ? '<p class="error-text">Inneholder noe du har valgt bort. Bytt retten.</p>' : ""}</div><div class="meal-offers"><span>${matched.length ? "Tilbud som passer retten" : "Basert på vanlige råvarer"}</span>${matched.map((o) => `<div class="used-offer"><strong>${html(o.name)}</strong><em>${html(o.store_label)} · ${html(o.price)}</em></div>`).join("")}<p class="small-note">${s.stale ? "Gamle tilbud brukes ikke i prisanslaget." : "* Sjekk lokal gyldighet og riktig produkt i butikken."}</p><button class="swap-meal" data-swap="${index}">Bytt middag</button><button class="text-button" data-remove-meal="${index}">Ta ut</button></div></article>`;
    })
    .join("");
}
function renderOffers() {
  const stores = [
    ...new Map(s.offers.map((o) => [o.store_key, o.store_label])).entries(),
  ];
  $("store-filters").innerHTML = stores
    .map(
      ([id, name]) =>
        `<label class="filter-check"><input type="checkbox" data-store="${html(id)}" ${s.p.stores.includes(id) ? "checked" : ""}><span>${html(name)}</span></label>`,
    )
    .join("");
  const query = normalize($("offer-search").value);
  const sort = $("sort-offers").value;
  const offers = s.offers
    .filter(
      (o) =>
        (!s.p.stores.length || s.p.stores.includes(o.store_key)) &&
        (!query || normalize(o.name + " " + o.store_label).includes(query)),
    )
    .sort((a, b) =>
      sort === "price"
        ? (price(a.price) ?? Infinity) - (price(b.price) ?? Infinity)
        : sort === "store"
          ? a.store_label.localeCompare(b.store_label, "nb")
          : a.name.localeCompare(b.name, "nb"),
    );
  $("result-count").textContent =
    offers.length + " mattilbud" + (s.stale ? " i arkivet" : " i kilden");
  $("offers-grid").innerHTML = offers.length
    ? offers
        .map(
          (o) =>
            `<article class="offer-card${s.p.selected.includes(o.id) ? " is-selected" : ""}${s.p.excluded.includes(o.id) ? " is-excluded" : ""}"><div class="offer-flags"><span class="category-label">${html(o.category === "__top__" ? "Matvare" : o.category)}</span><span class="saving-label">${s.stale ? "Arkiv" : "Sjekk gyldighet"}</span></div><h3 class="offer-title">${html(o.name)}</h3><p class="offer-quantity">${html(o.mengde || "Mengde ikke oppgitt")}</p><p class="offer-price">${html(o.price || "Ukjent pris")}</p><p class="offer-store">${html(o.store_label)}</p><div class="offer-actions"><button class="choose-offer" data-offer="${html(o.id)}" ${s.stale ? "disabled" : ""} aria-pressed="${s.p.selected.includes(o.id)}">${s.p.selected.includes(o.id) ? "Valgt ✓" : "Bruk i planen"}</button><button class="exclude-offer" data-exclude="${html(o.id)}" aria-label="Ikke bruk ${html(o.name)}" aria-pressed="${s.p.excluded.includes(o.id)}">${s.p.excluded.includes(o.id) ? "↺" : "×"}</button></div></article>`,
        )
        .join("")
    : '<div class="empty-state"><h3>Ingen tilbud passer</h3><p>Prøv et annet søk eller andre butikker.</p></div>';
}
function renderList() {
  const items = basket(s.p, s.offers, s.stale);
  const remaining = items.filter((i) => !s.p.checked.includes(i.id));
  $("shopping-overview").innerHTML =
    `<div class="shop-overview-card"><span>Gjenstår</span><strong>${remaining.length} varer</strong></div><div class="shop-overview-card"><span>Handleanslag</span><strong>${money(remaining.reduce((n, i) => n + i.cost, 0))}</strong></div><div class="shop-overview-card"><span>Tilbudspriser / anslåtte priser</span><strong>${remaining.filter((i) => i.offer).length} / ${remaining.filter((i) => !i.offer).length}</strong></div>`;
  const groups = new Map();
  for (const i of items) {
    const key = i.offer ? "Tilbud · " + i.offer.store_label : i.group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  $("shopping-list").innerHTML = items.length
    ? [...groups]
        .map(
          ([group, list]) =>
            `<section class="list-section"><h3>${html(group)}</h3><ul class="list-items">${list.map((i) => `<li class="shopping-item${s.p.checked.includes(i.id) ? " is-checked" : ""}"><label><input type="checkbox" data-checked="${i.id}" ${s.p.checked.includes(i.id) ? "checked" : ""}><span><strong>${html(i.name)}</strong><small>Trenger ${amount(i.quantity)} ${i.unit} · kjøp ${i.packs} × ${amount(i.size)} ${i.unit}${i.leftover ? " · " + amount(i.leftover) + " " + i.unit + " til overs" : ""}</small>${i.offer ? `<small>${html(i.offer.name)} · sjekk tilbudets gyldighet</small>` : ""}</span><span class="item-price">${money(i.cost)}<small>${i.offer ? "Tilbudspris*" : "Anslag"}</small></span></label></li>`).join("")}</ul></section>`,
        )
        .join("")
    : '<div class="empty-state"><h3>Ingen middager ennå</h3><p>Lag en ukeplan eller legg til retter fra kokeboka.</p><button class="primary-button" data-view="cookbook">Finn oppskrifter</button></div>';
}
function renderBook() {
  const q = normalize($("recipe-search").value);
  const mode = $("book-mode").value;
  const category = $("recipe-category").value;
  const found = RECIPES.filter(
    (r) =>
      (!q ||
        normalize(
          r.title +
            " " +
            r.ingredients.map(([id]) => INGREDIENTS[id][0]).join(" "),
        ).includes(q)) &&
      (!category || r.tags.includes(category)) &&
      (mode === "all" ||
        (mode === "saved" && s.p.saved.includes(r.id)) ||
        (mode === "rated" && s.p.ratings[r.id]) ||
        (mode === "favorites" && s.p.ratings[r.id] >= 4)),
  );
  $("book-count").textContent =
    found.length +
    " oppskrifter · " +
    s.p.saved.length +
    " lagret i din kokebok";
  $("recipe-grid").innerHTML = found.length
    ? found
        .map(
          (r) =>
            `<article class="recipe-card"><div class="recipe-card-top"><span>${r.tags.includes("vegetarian") ? "Grønn middag" : "Hverdagsfavoritt"}</span><strong>${money(recipeEstimate(r, s.p.servings))}</strong></div><h3>${html(r.title)}</h3><p>${html(r.tip)}</p>${tags(r)}<p class="small-note">Anslått råvareforbruk for ${s.p.servings} porsjoner, ikke handlepris.</p>${!eligible(r, s.p) ? '<p class="preference-warning">Passer ikke alle matpreferansene dine</p>' : ""}${recipeActions(r)}<button class="text-button add-plan" data-add="${r.id}">Legg i ukeplanen</button></article>`,
        )
        .join("")
    : '<div class="empty-state"><h3>Her er det plass til nye favoritter</h3><p>Lagre en oppskrift med hjertet, eller prøv et annet filter.</p><button id="show-all-recipes" class="secondary-button">Vis alle oppskrifter</button></div>';
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
  const r = RECIPES.find((r) => r.id === id);
  if (!r) return;
  s.recipe = id;
  const d = $("recipe-dialog");
  const rating = s.p.ratings[id] || 0;
  $("recipe-detail").innerHTML =
    `<p class="section-kicker">${r.time} minutter · ${s.p.servings} porsjoner</p><h2 id="recipe-title">${html(r.title)}</h2>${tags(r)}<div class="recipe-actions"><button class="save-button" data-save="${id}" aria-pressed="${s.p.saved.includes(id)}">${s.p.saved.includes(id) ? "♥ Lagret" : "♡ Lagre i kokeboka"}</button><button class="secondary-button" data-add="${id}">Legg i uka</button><button class="text-button" data-share-recipe="${id}">Del oppskrift</button></div><div class="detail-columns"><section><h3>Ingredienser</h3><ul class="ingredients-list">${r.ingredients.map(([iid, n]) => `<li><span>${html(INGREDIENTS[iid][0])}</span><strong>${amount((n * s.p.servings) / 2)} ${INGREDIENTS[iid][1]}</strong></li>`).join("")}</ul><p class="small-note">Salt, pepper og vann etter behov.</p></section><section><h3>Slik gjør du</h3><ol class="steps">${r.steps.map((step) => `<li>${html(scaledStep(step))}</li>`).join("")}</ol></section></div><aside class="recipe-tip"><strong>Smaksgrepet</strong><p>${html(r.tip)}</p></aside><section class="my-recipe"><h3>Ville du laget den igjen?</h3><div class="stars" role="group" aria-label="Din vurdering">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" aria-label="Gi ${n} stjerner" aria-pressed="${rating === n}" class="${n <= rating ? "rated" : ""}">★</button>`).join("")}<span>${rating ? rating + "/5" : "Ikke vurdert"}</span></div><label for="recipe-note">Mine notater</label><textarea id="recipe-note" maxlength="3000" rows="3" placeholder="Litt mer sitron neste gang?">${html(s.p.notes[id] || "")}</textarea><button id="save-note" class="secondary-button">Lagre notat</button></section>`;
  if (!d.open) d.showModal();
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
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.className = "copy-fallback";
    document.body.append(field);
    field.select();
    toast("Automatisk kopiering feilet. Teksten er markert nederst på siden.");
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
  s.p = result.data;
  s.key = result.key;
  s.revision = result.revision;
  s.blocked = false;
  s.dirty = false;
  rememberKey(s.key);
  history.replaceState(null, "", location.pathname + location.search);
  syncControls();
  status("Profil opprettet og lagret. Ta vare på din personlige lenke.");
  render();
}
async function loadData() {
  let data;
  for (const source of [
    "https://raw.githubusercontent.com/Olewol/tilbudsavis/main/latest-data.json",
    "/latest-data.json",
  ]) {
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) continue;
      const candidate = await response.json();
      if (!Array.isArray(candidate.products)) continue;
      data = candidate;
      s.source = source.startsWith("http")
        ? "Hentet fra kilden"
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
  s.meta = data.meta || {};
  s.offers = cleanOffers(data.products);
  s.stale = staleData(s.meta);
  const date = new Date(s.meta.generated);
  const label = Number.isFinite(date.valueOf())
    ? date.toLocaleDateString("nb-NO")
    : "ukjent dato";
  $("source-updated").textContent =
    `${s.source} · uke ${s.meta.week || "ukjent"} · oppdatert ${label}.`;
  $("data-warning").textContent = s.stale
    ? `Tilbudsgrunnlaget er gammelt (${label}). Det vises som arkiv og brukes ikke som dagens priser. Du kan fortsatt planlegge med tydelig merkede prisanslag.`
    : `Tilbudsgrunnlag fra ${label}. Sjekk dato, butikk og produkt i kundeavisen. Uten sikker pakningsstørrelse bruker vi et prisanslag i stedet.`;
  render();
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.view) view(d.view);
  if (d.recipe) openRecipe(d.recipe);
  if (d.save) {
    toggle("saved", d.save);
    changed();
    render();
    if ($("recipe-dialog").open) openRecipe(d.save);
  }
  if (d.add) {
    const r = RECIPES.find((r) => r.id === d.add);
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
    s.p.plan.push(d.add);
    s.p.checked = [];
    changed();
    render();
    toast("Lagt i ukeplanen");
  }
  if (d.rate) {
    s.p.ratings[s.recipe] = Number(d.rate);
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
    const pool = storePool(availableOffers(s.offers, s.p, s.stale), s.p);
    const r = RECIPES.filter(
      (r) => eligible(r, s.p) && !s.p.plan.includes(r.id),
    ).sort((a, b) => recipeScore(b, s.p, pool) - recipeScore(a, s.p, pool))[0];
    if (!r) {
      toast("Ingen flere retter passer preferansene.");
      return;
    }
    s.p.plan[Number(d.swap)] = r.id;
    s.p.checked = [];
    changed();
    render();
  }
  if (d.removeMeal !== undefined) {
    s.p.plan.splice(Number(d.removeMeal), 1);
    s.p.checked = [];
    changed();
    render();
  }
  if (d.shareRecipe)
    copy(
      location.origin + location.pathname + "#oppskrift=" + d.shareRecipe,
      "Oppskriftslenke kopiert, uten din profil",
    );
  if (b.id === "show-all-recipes") {
    $("book-mode").value = "all";
    $("recipe-search").value = "";
    $("recipe-category").value = "";
    renderBook();
  }
});
document.addEventListener("change", (event) => {
  const d = event.target.dataset;
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
      changed();
      render();
    }
  }
});
for (const id of ["quick-plan", "generate-plan", "first-plan"])
  $(id).addEventListener("click", generate);
for (const [id, key] of [
  ["meal-count", "days"],
  ["servings", "servings"],
  ["max-stores", "maxStores"],
])
  $(id).addEventListener("change", () => {
    s.p[key] = Number($(id).value);
    s.p.checked = [];
    changed();
    if (key === "days") generate();
    else render();
  });
for (const id of ["offer-search", "sort-offers"])
  $(id).addEventListener("input", renderOffers);
for (const id of ["recipe-search", "recipe-category", "book-mode"])
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
    if (file.size > 85000) throw new Error("Filen er for stor");
    const data = JSON.parse(await file.text());
    if (
      data.format !== "tilbudsplan-kokebok" ||
      data.version !== 1 ||
      !data.profile
    )
      throw new Error("Dette er ikke en kokebok fra Tilbudsplan");
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
$("retry-save").addEventListener("click", save);
$("refresh-data").addEventListener("click", async () => {
  $("refresh-data").disabled = true;
  try {
    await loadData();
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
    (i) => !s.p.checked.includes(i.id),
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
            `☐ ${i.name}: ${amount(i.quantity)} ${i.unit} (${i.packs} pakninger, ${money(i.cost)} ${i.offer ? "tilbud, sjekk gyldighet" : "anslag"})`,
        )
        .join("\n"),
    "Handlelisten er kopiert",
  );
});
window.addEventListener("beforeunload", (e) => {
  if (s.dirty || s.saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function init() {
  const params = new URLSearchParams(location.hash.slice(1));
  let key = params.get("profil");
  if (!key) {
    try {
      key = localStorage.getItem("tilbudsplan:profile-key");
    } catch {}
  }
  if (key) {
    try {
      const result = await api("GET", null, key);
      s.p = { ...emptyProfile(), ...result.data };
      s.key = key;
      s.revision = result.revision;
      rememberKey(key);
      history.replaceState(null, "", location.pathname + location.search);
      status("Kokeboka er lastet og klar");
    } catch (e) {
      status(e.message + " Eksisterende profil er ikke endret.", true);
    }
  }
  s.loading = false;
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
