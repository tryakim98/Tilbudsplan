const DATA_SOURCES = [
  "https://raw.githubusercontent.com/Olewol/tilbudsavis/main/latest-data.json",
  "latest-data.json",
];

const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const USEFUL_CATEGORIES = new Set([
  "Kylling", "Storfe", "Svin", "Laks", "Fisk", "Reker/scampi", "Egg", "Ost",
  "Grønnsaker", "Brød", "Ingredienser", "Pålegg", "Yoghurt"
]);

const storeOrder = ["kiwi", "rema", "extra", "spar", "obs", "meny", "bunnpris", "europris", "coopmarked"];

const MEALS = [
  {
    id: "sticky-chicken",
    title: "Klissete kyllingbrett med sprø poteter",
    description: "Soyaglasert kylling, ovnsstekte poteter og sødmefull gulrot. Alt på ett brett, med en syrlig yoghurtdressing.",
    time: "40 min", effort: "Én langpanne", flavor: "søt · salt · syrlig",
    slots: [
      { categories: ["Kylling"], keywords: ["kylling", "chicken"] },
      { categories: ["Grønnsaker"], keywords: ["potet", "gulrot", "kål"] },
    ],
    pantry: [
      ["Tørrvarer", "Soyasaus", "3 ss"], ["Tørrvarer", "Honning", "2 ss"],
      ["Grønt & ferskt", "Hvitløk", "3 fedd"], ["Kjøl", "Yoghurt eller rømme", "2 dl"],
    ],
  },
  {
    id: "salmon-butter",
    title: "Miso-smørlaks med knuste poteter",
    description: "Saftig laks under et salt, karamellisert smørlokk. Serveres med knuste poteter og grønt som tåler høy varme.",
    time: "35 min", effort: "Lett", flavor: "umami · smør · frisk",
    slots: [
      { categories: ["Laks"], keywords: ["laks", "salmon"] },
      { categories: ["Grønnsaker"], keywords: ["potet", "brokkoli", "blomkål"] },
    ],
    pantry: [
      ["Kjøl", "Smør", "60 g"], ["Tørrvarer", "Miso eller soyasaus", "2 ss"],
      ["Grønt & ferskt", "Sitron", "1 stk"], ["Grønt & ferskt", "Vårløk", "1 bunt"],
    ],
  },
  {
    id: "pork-stroganoff",
    title: "Kremet svinegryte med sennep og paprika",
    description: "Rask stroganoff med godt brunede strimler, løk og paprika i en fyldig saus. Fin med ris eller potetmos.",
    time: "30 min", effort: "Én gryte", flavor: "fyldig · pepper · sennep",
    slots: [
      { categories: ["Svin"], keywords: ["svin", "biffstrimler", "strimlet"] },
      { categories: ["Grønnsaker"], keywords: ["paprika", "sopp", "løk"] },
    ],
    pantry: [
      ["Grønt & ferskt", "Gul løk", "2 stk"], ["Kjøl", "Matfløte", "3 dl"],
      ["Tørrvarer", "Dijonsennep", "1 ss"], ["Tørrvarer", "Ris", "300 g"],
    ],
  },
  {
    id: "smash-tacos",
    title: "Sprø smash-tacos med chilidressing",
    description: "Kjøttdeig presses rett på tortilla og stekes hardt. Toppes med smeltet ost, sprø kål og syrlig chilidressing.",
    time: "25 min", effort: "Rask", flavor: "sprø · sterk · kremet",
    slots: [
      { categories: ["Storfe"], keywords: ["kjøttdeig", "burger", "storfe"] },
      { categories: ["Ost"], keywords: ["ost", "cheddar", "mozzarella"] },
      { categories: ["Brød", "Ingredienser"], keywords: ["tex-mex", "tortilla", "lompe"] },
    ],
    pantry: [
      ["Grønt & ferskt", "Kål", "¼ hode"], ["Kjøl", "Rømme", "2 dl"],
      ["Tørrvarer", "Chilisaus", "etter smak"], ["Grønt & ferskt", "Lime", "1 stk"],
    ],
  },
  {
    id: "scampi-pasta",
    title: "Scampipasta med hvitløk, tomat og chili",
    description: "En blank, sterk tomatsaus som fester seg til pastaen, med scampi akkurat lenge nok i panna til å bli saftig.",
    time: "25 min", effort: "Rask", flavor: "hvitløk · chili · tomat",
    slots: [
      { categories: ["Reker/scampi"], keywords: ["scampi", "reker"] },
      { categories: ["Grønnsaker"], keywords: ["tomat"] },
    ],
    pantry: [
      ["Tørrvarer", "Pasta", "400 g"], ["Grønt & ferskt", "Hvitløk", "4 fedd"],
      ["Tørrvarer", "Hakkede tomater", "2 bokser"], ["Tørrvarer", "Chiliflak", "1 ts"],
    ],
  },
  {
    id: "fishcake-tray",
    title: "Fiskekaker med ovnsgrønt og urtesmør",
    description: "Hverdagsmiddag løftet med hard stekeskorpe, ovnsbakte grønnsaker og smør med urter, kapers og sitron.",
    time: "35 min", effort: "Lett", flavor: "smør · urter · sitron",
    slots: [
      { categories: ["Fisk"], keywords: ["fiskekake", "fiskeburger", "fiskeprodukt"] },
      { categories: ["Grønnsaker"], keywords: ["rotgrønnsaker", "potet", "gulrot", "blomkål"] },
    ],
    pantry: [
      ["Kjøl", "Smør", "50 g"], ["Grønt & ferskt", "Sitron", "1 stk"],
      ["Tørrvarer", "Kapers", "2 ss"], ["Grønt & ferskt", "Friske urter", "1 bunt"],
    ],
  },
  {
    id: "shakshuka",
    title: "Røkt shakshuka med ost og sprøtt brød",
    description: "Egg bakt i en krydret tomatsaus med paprika, spisskummen og litt røyk. Ost og godt brød gjør den mettende.",
    time: "30 min", effort: "Én panne", flavor: "tomat · røyk · krydder",
    slots: [
      { categories: ["Egg"], keywords: ["egg"] },
      { categories: ["Ost"], keywords: ["salatost", "feta", "mozzarella", "ost"] },
      { categories: ["Brød"], keywords: ["brød", "baguette", "fiberstykker"] },
    ],
    pantry: [
      ["Tørrvarer", "Hakkede tomater", "2 bokser"], ["Grønt & ferskt", "Gul løk", "1 stk"],
      ["Grønt & ferskt", "Paprika", "2 stk"], ["Tørrvarer", "Spisskummen", "2 ts"],
    ],
  },
  {
    id: "crispy-wraps",
    title: "Crispy chicken-wraps med knust agurksalat",
    description: "Sprø kylling, iskald agurk og en sterk-søt saus i varme lefser. En fredagsmiddag som fortsatt er enkel.",
    time: "25 min", effort: "Rask", flavor: "sprø · frisk · hot honey",
    slots: [
      { categories: ["Kylling"], keywords: ["crispy chicken", "hot wings", "vinge"] },
      { categories: ["Brød", "Ingredienser"], keywords: ["lompe", "tortilla", "tex-mex"] },
    ],
    pantry: [
      ["Grønt & ferskt", "Agurk", "1 stk"], ["Kjøl", "Majones", "1 dl"],
      ["Tørrvarer", "Chilisaus", "2 ss"], ["Tørrvarer", "Honning", "1 ss"],
    ],
  },
  {
    id: "beef-wok",
    title: "Pepperwok med biffstrimler og glinsende saus",
    description: "Rask wok med høy varme, grov svartpepper og en konsentrert soyasaus. Serveres med ris og sprøtt grønt.",
    time: "25 min", effort: "Rask", flavor: "pepper · ingefær · soya",
    slots: [
      { categories: ["Storfe", "Svin"], keywords: ["biffstrimler", "strimlet", "ytrefilet", "grytekjøtt"] },
      { categories: ["Grønnsaker"], keywords: ["brokkoli", "kål", "gulrot", "paprika"] },
    ],
    pantry: [
      ["Tørrvarer", "Ris", "300 g"], ["Tørrvarer", "Soyasaus", "4 ss"],
      ["Grønt & ferskt", "Ingefær", "1 bit"], ["Grønt & ferskt", "Hvitløk", "3 fedd"],
    ],
  },
  {
    id: "white-pizza",
    title: "Hvit pizza med mozzarella og pepperoni",
    description: "Sprø bunn med hvitløkskrem, mozzarella, pepperoni og frisk salat etter steking. Enkel, men skikkelig digg.",
    time: "30 min", effort: "Helgekos", flavor: "ost · hvitløk · pepperoni",
    slots: [
      { categories: ["Ost"], keywords: ["mozzarella", "ost"] },
      { categories: ["Pålegg"], keywords: ["pepperoni", "ventricina", "sognemorr"] },
      { categories: ["Grønnsaker", "Drikke"], keywords: ["ruccola", "salat"] },
    ],
    pantry: [
      ["Tørrvarer", "Pizzabunner", "2 stk"], ["Kjøl", "Crème fraîche", "2 dl"],
      ["Grønt & ferskt", "Hvitløk", "2 fedd"], ["Tørrvarer", "Olivenolje", "litt"],
    ],
  },
];

const state = {
  offers: [],
  meta: {},
  selected: new Set(readStored("tilbudsplan:selected", [])),
  excluded: new Set(readStored("tilbudsplan:excluded", [])),
  checked: new Set(readStored("tilbudsplan:checked", [])),
  storeFilters: new Set(),
  categoryFilters: new Set(),
  plan: [],
  source: "",
};

const el = (id) => document.getElementById(id);

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function persist() {
  localStorage.setItem("tilbudsplan:selected", JSON.stringify([...state.selected]));
  localStorage.setItem("tilbudsplan:excluded", JSON.stringify([...state.excluded]));
  localStorage.setItem("tilbudsplan:checked", JSON.stringify([...state.checked]));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9æøå]+/g, " ").trim();
}

function makeId(offer) {
  return normalize([offer.name, offer.store_key || offer.store, offer.price].join("-")).replaceAll(" ", "-");
}

function deriveTopCategory(offer) {
  const text = normalize(`${offer.name} ${offer.mengde}`);
  const rules = [
    ["Kylling", ["kylling", "chicken"]], ["Laks", ["laks", "salmon"]],
    ["Fisk", ["fiskekake", "fiskeburger", "fiskeprodukt"]], ["Reker/scampi", ["scampi", "reker"]],
    ["Storfe", ["kjottdeig", "burger", "storfe", "grytekjott"]], ["Svin", ["svin", "biffstrimler"]],
    ["Ost", ["ost", "mozzarella", "graddost"]], ["Pålegg", ["pepperoni", "polse"]],
    ["Brød", ["brød", "morgenstykker", "baguette"]], ["Grønnsaker", ["salat", "potet", "gulrot", "kal"]],
    ["Kaffe", ["kaffe", "friele", "evergood"]], ["Drikke", ["coca", "pepsi", "fanta", "solo"]],
    ["Snacks", ["sjokolade", "kvikk", "chips"]], ["Husholdning", ["vask", "toalett", "tannkrem"]],
  ];
  return rules.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || "Ukens beste";
}

function parsePrice(value = "") {
  if (/for|%/.test(String(value).toLowerCase())) return Number.POSITIVE_INFINITY;
  const match = String(value).replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : Number.POSITIVE_INFINITY;
}

function savingAmount(offer) {
  const text = `${offer.merknad || ""} ${offer.price || ""}`.toLowerCase();
  const money = text.match(/spar\s*(\d+(?:[.,]\d+)?)/);
  if (money) return Number(money[1].replace(",", "."));
  const percent = text.match(/-(\d+)\s*%/);
  if (percent) return Number(percent[1]) * 0.8;
  if (/3\s*for\s*2/.test(text)) return 10;
  if (/før/.test(text)) return 5;
  return 0;
}

function isMealUseful(offer) {
  return USEFUL_CATEGORIES.has(offer.category) || offer.category === "Ukens beste";
}

function cleanOffers(products) {
  const result = new Map();
  for (const raw of products || []) {
    const offer = { ...raw };
    offer.category = offer.category === "__top__" ? deriveTopCategory(offer) : offer.category;
    offer.store_key = offer.store_key || normalize(offer.store).replaceAll(" ", "");
    offer.store_label = offer.store_label || offer.store;
    offer.id = makeId(offer);
    offer.saving = savingAmount(offer);
    offer.useful = isMealUseful(offer);
    const existing = result.get(offer.id);
    if (!existing || offer.saving > existing.saving) result.set(offer.id, offer);
  }
  return [...result.values()];
}

async function fetchWithTimeout(url, ms = 3200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function loadData() {
  let data;
  for (const source of DATA_SOURCES) {
    try {
      data = await fetchWithTimeout(source);
      state.source = source.startsWith("http") ? "live" : "snapshot";
      break;
    } catch { /* try fallback */ }
  }
  if (!data?.products) throw new Error("Kunne ikke lese tilbudsdata");
  state.meta = data.meta || {};
  state.offers = cleanOffers(data.products);
  const currentIds = new Set(state.offers.map((offer) => offer.id));
  state.selected = new Set([...state.selected].filter((id) => currentIds.has(id)));
  state.excluded = new Set([...state.excluded].filter((id) => currentIds.has(id)));
  initializeFilters();
  updateMeta();
  renderOffers();
  updateCounts();
}

function initializeFilters() {
  const stores = [...new Map(state.offers.map((o) => [o.store_key, o.store_label])).entries()]
    .sort(([a], [b]) => (storeOrder.indexOf(a) < 0 ? 99 : storeOrder.indexOf(a)) - (storeOrder.indexOf(b) < 0 ? 99 : storeOrder.indexOf(b)));
  const categories = [...new Set(state.offers.filter((o) => o.useful).map((o) => o.category))].sort((a, b) => a.localeCompare(b, "nb"));
  state.storeFilters = new Set(stores.map(([key]) => key));
  state.categoryFilters = new Set(categories);

  el("store-filters").innerHTML = stores.map(([key, label]) => {
    const count = state.offers.filter((o) => o.store_key === key && o.useful).length;
    return `<label class="filter-check"><input type="checkbox" data-store-filter="${escapeHtml(key)}" checked><span>${escapeHtml(label)}</span><small>${count}</small></label>`;
  }).join("");
  el("category-filters").innerHTML = categories.map((category) => {
    const count = state.offers.filter((o) => o.category === category).length;
    return `<label class="filter-check"><input type="checkbox" data-category-filter="${escapeHtml(category)}" checked><span>${escapeHtml(category)}</span><small>${count}</small></label>`;
  }).join("");
}

function updateMeta() {
  const generated = state.meta.generated ? new Date(state.meta.generated) : null;
  el("week-label").textContent = `Uke ${state.meta.week || "–"}`;
  el("data-status").textContent = state.source === "live" ? "Live ukesdata" : "Lagret ukesdata";
  el("offer-count").textContent = state.offers.length;
  el("store-count").textContent = new Set(state.offers.map((o) => o.store_key)).size;
  el("quality-score").textContent = state.meta.quality_score ? `${state.meta.quality_score}/100` : "–";
  if (generated && !Number.isNaN(generated.valueOf())) {
    el("source-updated").textContent = `Uke ${state.meta.week}. Oppdatert ${generated.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })} fra eTilbudsavis-data.`;
  }
}

function getFilteredOffers() {
  const query = normalize(el("offer-search").value);
  const sort = el("sort-offers").value;
  const dealsFirst = el("deals-only").checked;
  const offers = state.offers.filter((offer) =>
    offer.useful && state.storeFilters.has(offer.store_key) && state.categoryFilters.has(offer.category) &&
    (!query || normalize(`${offer.name} ${offer.store_label} ${offer.category} ${offer.mengde}`).includes(query))
  );

  return offers.sort((a, b) => {
    if (dealsFirst && b.saving !== a.saving) return b.saving - a.saving;
    if (sort === "price") return parsePrice(a.price) - parsePrice(b.price);
    if (sort === "store") return a.store_label.localeCompare(b.store_label, "nb") || b.saving - a.saving;
    return b.saving - a.saving || parsePrice(a.price) - parsePrice(b.price);
  });
}

function renderOffers() {
  const offers = getFilteredOffers();
  el("result-count").textContent = `${offers.length} relevante tilbud`;
  el("empty-offers").hidden = offers.length > 0;
  el("offers-grid").innerHTML = offers.map((offer) => {
    const selected = state.selected.has(offer.id);
    const excluded = state.excluded.has(offer.id);
    const saving = offer.saving > 0 ? (offer.merknad.match(/spar\s*\d+(?:[.,]\d+)?/i)?.[0] || offer.price.match(/-\d+\s*%/)?.[0] || "Kupp") : "";
    const priceClass = /%|for/i.test(offer.price) ? " is-percent" : "";
    return `<article class="offer-card${selected ? " is-selected" : ""}${excluded ? " is-excluded" : ""}" data-offer-id="${escapeHtml(offer.id)}">
      <div class="offer-flags">
        <span class="category-label">${escapeHtml(offer.category)}</span>
        ${saving ? `<span class="saving-label">${escapeHtml(saving)}</span>` : ""}
      </div>
      <h3 class="offer-title">${escapeHtml(toTitleCase(offer.name))}</h3>
      <p class="offer-quantity">${escapeHtml(offer.mengde || offer.merknad || "")}</p>
      <p class="offer-price${priceClass}">${escapeHtml(offer.price || offer.merknad || "Se tilbud")}</p>
      <p class="offer-store">${escapeHtml(offer.store_label)}</p>
      <div class="offer-actions">
        <button class="choose-offer" type="button" data-choose="${escapeHtml(offer.id)}" aria-pressed="${selected}">${selected ? "Valgt ✓" : "Velg tilbud"}</button>
        <button class="exclude-offer" type="button" data-exclude="${escapeHtml(offer.id)}" aria-pressed="${excluded}" aria-label="${excluded ? "Ta med igjen" : "Ikke bruk"}: ${escapeHtml(offer.name)}">${excluded ? "↺" : "×"}</button>
      </div>
    </article>`;
  }).join("");
}

function toTitleCase(value = "") {
  const text = String(value).trim();
  if (text !== text.toUpperCase()) return text;
  return text.toLocaleLowerCase("nb-NO").replace(/(^|[\s/&-])\p{L}/gu, (m) => m.toLocaleUpperCase("nb-NO"));
}

function updateCounts() {
  const selected = state.selected.size;
  el("selected-count-badge").textContent = selected;
  el("sticky-selection").textContent = `${selected} tilbud valgt`;
  el("sticky-hint").textContent = selected < 3 ? "Velg gjerne 3–8 tilbud" : "Klart for å lage ukeplan";
  el("plan-count-badge").textContent = state.plan.length;
  const listCount = buildShoppingItems().reduce((sum, group) => sum + group.items.length, 0);
  el("list-count-badge").textContent = listCount;
  persist();
}

function toggleSelection(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else { state.selected.add(id); state.excluded.delete(id); }
  renderOffers();
  updateCounts();
}

function toggleExcluded(id) {
  if (state.excluded.has(id)) state.excluded.delete(id);
  else { state.excluded.add(id); state.selected.delete(id); }
  renderOffers();
  updateCounts();
}

function selectAutoOffers() {
  const candidates = state.offers
    .filter((o) => o.useful && !state.excluded.has(o.id) && o.saving > 0)
    .sort((a, b) => b.saving - a.saving);
  const categories = new Set();
  const stores = new Set();
  for (const offer of candidates) {
    if (state.selected.size >= 7) break;
    if (categories.has(offer.category) && state.selected.size >= 4) continue;
    if (stores.size >= 3 && !stores.has(offer.store_key)) continue;
    state.selected.add(offer.id);
    categories.add(offer.category);
    stores.add(offer.store_key);
  }
  persist();
}

function matchesSlot(offer, slot) {
  const text = normalize(`${offer.name} ${offer.mengde}`);
  const categoryMatch = slot.categories?.includes(offer.category);
  const keywordMatch = slot.keywords?.some((keyword) => text.includes(normalize(keyword)));
  return categoryMatch && (!slot.keywords?.length || keywordMatch) || keywordMatch;
}

function chooseStores(pool, maxStores) {
  if (maxStores >= 8) return new Set(pool.map((o) => o.store_key));
  const scores = new Map();
  for (const offer of pool) {
    const boost = state.selected.has(offer.id) ? 100 : 0;
    scores.set(offer.store_key, (scores.get(offer.store_key) || 0) + boost + offer.saving + 1);
  }
  return new Set([...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxStores).map(([store]) => store));
}

function scoreMeal(meal, pool) {
  return meal.slots.reduce((score, slot) => {
    const matches = pool.filter((o) => matchesSlot(o, slot));
    if (!matches.length) return score - 7;
    const selectedMatch = matches.some((o) => state.selected.has(o.id));
    return score + (selectedMatch ? 18 : 6) + Math.min(6, Math.max(...matches.map((o) => o.saving)) / 8);
  }, 0);
}

function buildMeal(meal, pool) {
  const used = [];
  for (const slot of meal.slots) {
    const candidates = pool.filter((offer) => matchesSlot(offer, slot) && !used.some((u) => u.id === offer.id));
    candidates.sort((a, b) => Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) || b.saving - a.saving || parsePrice(a.price) - parsePrice(b.price));
    if (candidates[0]) used.push(candidates[0]);
  }
  return { ...meal, usedOffers: used };
}

function generatePlan(offset = 0) {
  if (!state.selected.size) selectAutoOffers();
  const count = Number(el("meal-count").value);
  const maxStores = Number(el("max-stores").value);
  const basePool = state.offers.filter((o) => o.useful && !state.excluded.has(o.id));
  const stores = chooseStores(basePool, maxStores);
  const pool = basePool.filter((o) => stores.has(o.store_key));
  const ranked = MEALS.map((meal, index) => ({ meal, score: scoreMeal(meal, pool), index }))
    .sort((a, b) => b.score - a.score || ((a.index + offset) % MEALS.length) - ((b.index + offset) % MEALS.length));
  const shifted = offset ? [...ranked.slice(offset % ranked.length), ...ranked.slice(0, offset % ranked.length)] : ranked;
  state.plan = shifted.slice(0, count).map(({ meal }) => buildMeal(meal, pool));
  renderPlan();
  updateCounts();
}

function renderPlan() {
  const hasPlan = state.plan.length > 0;
  el("plan-empty").hidden = hasPlan;
  el("plan-summary").hidden = !hasPlan;
  el("meal-plan").innerHTML = !hasPlan ? "" : state.plan.map((meal, index) => `
    <article class="meal-card">
      <div class="meal-day"><span>Dag ${index + 1}</span><strong>${DAYS[index]}</strong></div>
      <div class="meal-copy">
        <h3>${escapeHtml(meal.title)}</h3>
        <p>${escapeHtml(meal.description)}</p>
        <div class="meal-tags"><span class="meal-tag">${escapeHtml(meal.time)}</span><span class="meal-tag">${escapeHtml(meal.effort)}</span><span class="meal-tag">${escapeHtml(meal.flavor)}</span></div>
      </div>
      <div class="meal-offers">
        <span>Bruker disse tilbudene</span>
        ${meal.usedOffers.length ? meal.usedOffers.map((offer) => `<div class="used-offer"><strong>${escapeHtml(toTitleCase(offer.name))}</strong><em>${escapeHtml(offer.store_label)} · ${escapeHtml(offer.price || offer.merknad)}</em></div>`).join("") : `<div class="used-offer"><strong>Ingen perfekt tilbudsmatch</strong><em>Planen bruker vanlige basisvarer.</em></div>`}
        <button class="swap-meal" type="button" data-swap-meal="${index}">Bytt denne middagen</button>
      </div>
    </article>`).join("");

  if (hasPlan) {
    const used = [...new Map(state.plan.flatMap((m) => m.usedOffers).map((o) => [o.id, o])).values()];
    const stores = new Set(used.map((o) => o.store_key));
    const known = used.map((o) => parsePrice(o.price)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
    el("plan-summary").innerHTML = `
      <div class="summary-stat"><span>Middager</span><strong>${state.plan.length}</strong></div>
      <div class="summary-stat"><span>Butikker</span><strong>${stores.size || 1}</strong></div>
      <div class="summary-stat"><span>Kjente tilbudspriser</span><strong>ca. ${Math.round(known)} kr</strong></div>`;
  }
}

function swapMeal(index) {
  const currentIds = new Set(state.plan.map((m) => m.id));
  const basePool = state.offers.filter((o) => o.useful && !state.excluded.has(o.id));
  const stores = chooseStores(basePool, Number(el("max-stores").value));
  const pool = basePool.filter((o) => stores.has(o.store_key));
  const replacement = MEALS.filter((meal) => !currentIds.has(meal.id)).sort((a, b) => scoreMeal(b, pool) - scoreMeal(a, pool))[0];
  if (!replacement) return;
  state.plan[index] = buildMeal(replacement, pool);
  renderPlan();
  renderShoppingList();
  updateCounts();
}

function scaleQuantity(quantity, servings) {
  if (servings === 4) return quantity;
  const factor = servings / 4;
  return quantity.replace(/^([¼½¾]|\d+(?:[.,]\d+)?)/, (raw) => {
    const fractions = { "¼": .25, "½": .5, "¾": .75 };
    const number = fractions[raw] || Number(raw.replace(",", "."));
    const scaled = number * factor;
    return Number.isInteger(scaled) ? String(scaled) : String(Math.round(scaled * 10) / 10).replace(".", ",");
  });
}

function buildShoppingItems() {
  if (!state.plan.length) return [];
  const servings = Number(el("servings").value);
  const groups = new Map();
  const add = (group, item) => {
    if (!groups.has(group)) groups.set(group, new Map());
    const key = normalize(item.name);
    const existing = groups.get(group).get(key);
    if (existing && !item.offer) existing.quantity = `${existing.quantity} + ${item.quantity}`;
    else groups.get(group).set(key, item);
  };

  for (const meal of state.plan) {
    for (const offer of meal.usedOffers) {
      add(`Butikk · ${offer.store_label}`, {
        id: `offer-${offer.id}`, name: toTitleCase(offer.name), quantity: offer.mengde || "1 pakke",
        price: offer.price || offer.merknad, offer: true,
      });
    }
    for (const [group, name, quantity] of meal.pantry) {
      add(group, { id: `base-${normalize(`${group}-${name}`)}`, name, quantity: scaleQuantity(quantity, servings), price: "", offer: false });
    }
  }

  const order = ["Butikk", "Grønt & ferskt", "Kjøl", "Tørrvarer"];
  return [...groups.entries()].map(([name, map]) => ({ name, items: [...map.values()] }))
    .sort((a, b) => order.findIndex((x) => a.name.startsWith(x)) - order.findIndex((x) => b.name.startsWith(x)));
}

function renderShoppingList() {
  const groups = buildShoppingItems();
  const items = groups.flatMap((g) => g.items);
  const offers = items.filter((i) => i.offer);
  const known = offers.map((i) => parsePrice(i.price)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  const stores = groups.filter((g) => g.name.startsWith("Butikk")).length;

  el("shopping-overview").innerHTML = `
    <div class="shop-overview-card"><span>Varer på lista</span><strong>${items.length}</strong></div>
    <div class="shop-overview-card"><span>Butikkstopp</span><strong>${stores}</strong></div>
    <div class="shop-overview-card"><span>Kjente tilbudspriser</span><strong>ca. ${Math.round(known)} kr</strong></div>`;

  el("shopping-list").innerHTML = groups.length ? groups.map((group) => `
    <section class="list-section">
      <h3>${escapeHtml(group.name)} <small>${group.items.length} varer</small></h3>
      <ul class="list-items">${group.items.map((item) => {
        const checked = state.checked.has(item.id);
        return `<li class="shopping-item${checked ? " is-checked" : ""}">
          <label><input type="checkbox" data-shopping-id="${escapeHtml(item.id)}" ${checked ? "checked" : ""}>
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.quantity)}</small></span>
            <span class="item-price">${escapeHtml(item.price)}</span>
          </label>
        </li>`;
      }).join("")}</ul>
    </section>`).join("") : `<div class="empty-state"><h3>Lag en ukeplan først</h3><p>Da samler vi alle tilbuds- og basisvarene her.</p></div>`;
  updateCounts();
}

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `${name}-view`));
  document.querySelectorAll(".flow-tab").forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("is-active", active);
    active ? tab.setAttribute("aria-current", "step") : tab.removeAttribute("aria-current");
  });
  if (name === "plan" && !state.plan.length) generatePlan();
  if (name === "list") renderShoppingList();
  window.scrollTo({ top: document.querySelector(".flow-tabs").offsetTop - 10, behavior: "smooth" });
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function copyShoppingList() {
  const groups = buildShoppingItems();
  const text = [`TILBUDSPLAN · UKE ${state.meta.week || ""}`, ""];
  for (const group of groups) {
    text.push(group.name.toUpperCase());
    for (const item of group.items) text.push(`☐ ${item.name} — ${item.quantity}${item.price ? ` (${item.price})` : ""}`);
    text.push("");
  }
  navigator.clipboard.writeText(text.join("\n")).then(() => showToast("Handlelisten er kopiert"), () => showToast("Kunne ikke kopiere automatisk"));
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const choose = event.target.closest("[data-choose]");
    const exclude = event.target.closest("[data-exclude]");
    const swap = event.target.closest("[data-swap-meal]");
    const tab = event.target.closest(".flow-tab");
    if (choose) toggleSelection(choose.dataset.choose);
    if (exclude) toggleExcluded(exclude.dataset.exclude);
    if (swap) swapMeal(Number(swap.dataset.swapMeal));
    if (tab) showView(tab.dataset.view);
  });

  el("offer-search").addEventListener("input", renderOffers);
  el("sort-offers").addEventListener("change", renderOffers);
  el("deals-only").addEventListener("change", renderOffers);
  el("store-filters").addEventListener("change", (event) => {
    const key = event.target.dataset.storeFilter;
    if (!key) return;
    event.target.checked ? state.storeFilters.add(key) : state.storeFilters.delete(key);
    renderOffers();
  });
  el("category-filters").addEventListener("change", (event) => {
    const category = event.target.dataset.categoryFilter;
    if (!category) return;
    event.target.checked ? state.categoryFilters.add(category) : state.categoryFilters.delete(category);
    renderOffers();
  });
  el("clear-choices").addEventListener("click", () => {
    state.selected.clear(); state.excluded.clear(); state.plan = [];
    renderOffers(); renderPlan(); updateCounts(); showToast("Valgene er nullstilt");
  });
  el("go-to-plan").addEventListener("click", () => { generatePlan(); showView("plan"); });
  el("back-to-offers").addEventListener("click", () => showView("offers"));
  el("auto-plan").addEventListener("click", () => { selectAutoOffers(); generatePlan(); renderOffers(); });
  el("generate-plan").addEventListener("click", () => generatePlan(Math.floor(Math.random() * MEALS.length)));
  el("regenerate-bottom").addEventListener("click", () => generatePlan(Math.floor(Math.random() * MEALS.length)));
  el("meal-count").addEventListener("change", () => generatePlan());
  el("max-stores").addEventListener("change", () => generatePlan());
  el("servings").addEventListener("change", renderShoppingList);
  el("go-to-list").addEventListener("click", () => showView("list"));
  el("back-to-plan").addEventListener("click", () => showView("plan"));
  el("shopping-list").addEventListener("change", (event) => {
    const id = event.target.dataset.shoppingId;
    if (!id) return;
    event.target.checked ? state.checked.add(id) : state.checked.delete(id);
    persist(); renderShoppingList();
  });
  el("check-pantry").addEventListener("click", () => {
    buildShoppingItems().flatMap((g) => g.items).filter((i) => !i.offer).forEach((i) => state.checked.add(i.id));
    persist(); renderShoppingList(); showToast("Basisvarene er krysset av");
  });
  el("clear-checked").addEventListener("click", () => { state.checked.clear(); persist(); renderShoppingList(); });
  el("copy-list").addEventListener("click", copyShoppingList);
}

bindEvents();
loadData().catch((error) => {
  el("data-status").textContent = "Data kunne ikke lastes";
  el("offers-grid").innerHTML = `<div class="empty-state"><h3>Tilbudene tok ikke veien inn</h3><p>${escapeHtml(error.message)}. Prøv å laste siden på nytt.</p></div>`;
});
