import { INGREDIENTS } from "./recipes.js";
import { catalog, validGeneratedRecipe } from "./model.js";
import {
  availableOffers,
  offerFor,
  eligible,
  makePlan,
  basketWithPool,
  coverage,
  recipeScore,
} from "./engine.js";
import { comparison, declaredOrganic } from "./offers.js";

export const OFFER_TARGET = 80;
// A pantry ingredient is excluded only when stock covers the entire week's
// quantity. A small shared stock must not count as enough for every dinner.
export function mealCoverage(recipes, items) {
  const lines = new Map(items.map((i) => [i.id, i]));
  return recipes.map((r) => ({
    id: r.id,
    title: r.title,
    ...coverage(
      [...new Set(r.ingredients.map(([id]) => id))]
        .map((id) => lines.get(id))
        .filter(Boolean),
    ),
  }));
}
const luxury = new Set([
  "scampi",
  "beefsteak",
  "porktender",
  "lambfilet",
  "duck",
  "salmon",
  "parmesan",
  "feta",
]);
const mains = [
  "scampi",
  "salmon",
  "whitefish",
  "beefsteak",
  "porktender",
  "pork",
  "duck",
  "lambfilet",
  "chicken",
  "chickenmince",
  "porkmince",
  "lambmince",
  "mince",
  "fishcake",
  "eggs",
  "lentils",
];
const vegetables = [
  "carrot",
  "redonion",
  "freshtomato",
  "broccolini",
  "greenbeans",
  "broccoli",
  "mushroom",
  "zucchini",
  "leek",
  "cabbage",
  "cauliflower",
  "spinach",
];
const vegetarianMains = new Set(["eggs", "lentils"]);
const fish = new Set(["salmon", "whitefish"]);
const minces = new Set(["chickenmince", "porkmince", "lambmince", "mince"]);
const portions = { scampi: 250, eggs: 4, lentils: 160, fishcake: 350 };
const mainQuantity = (id) => portions[id] || 300;
export function offerTraits(o) {
  return {
    organic: declaredOrganic(o),
    luxury: (o.matches || []).some((id) => luxury.has(id)),
    documented: comparison(o).safe && comparison(o).discount > 0,
  };
}
function recipeId(text) {
  let hash = 14695981039346656037n;
  for (const char of text)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(char.codePointAt(0))) * 1099511628211n,
    );
  return "offer-" + hash.toString(16).padStart(16, "0");
}
function proteinGroup(r) {
  const id =
    r.main ||
    r.ingredients.find(([id]) => mains.includes(id))?.[0] ||
    "vegetarian";
  if (["chicken", "chickenmince"].includes(id)) return "chicken";
  if (["pork", "porktender", "porkmince"].includes(id)) return "pork";
  if (["beefsteak", "mince"].includes(id)) return "beef";
  if (["lambfilet", "lambmince"].includes(id)) return "lamb";
  return id;
}
function styleOf(r) {
  if (r.style) return r.style;
  if (/pasta|spaghetti/i.test(r.title)) return "pasta";
  if (/ris|nudl|wok/i.test(r.title)) return "rice";
  if (/omelett|frittata/i.test(r.title)) return "frittata";
  if (/suppe|gryte|curry/i.test(r.title)) return "stew";
  if (/ovn|form|bakt/i.test(r.title)) return "tray";
  return "pan";
}
export function menuVariety(recipes) {
  return {
    proteins: new Set(recipes.map(proteinGroup)).size,
    styles: new Set(recipes.map(styleOf)).size,
  };
}
function prepareMain(id) {
  if (id === "eggs")
    return "Visp eggene sammen med salt og pepper fra ingredienslisten.";
  if (id === "lentils")
    return "Skyll linsene og kok dem i vann etter pakkens anvisning, til de er møre. Hell av vannet.";
  if (id === "scampi")
    return "Tin eventuelle frosne scampi i kjøleskap på forhånd. Fjern skall og tarmstreng om nødvendig. Tørk godt. Hold rå sjømat og redskaper atskilt fra ferdig mat.";
  if (minces.has(id))
    return "Brun kjøttdeigen i litt av fettet på middels høy varme. Del den i små biter og stek til den er helt gjennomstekt. Legg til side.";
  return `Tin eventuell frossen ${INGREDIENTS[id][0].toLowerCase()} i kjøleskap på forhånd. Tørk råvaren godt og skjær den i jevne porsjoner. Vask hender og redskaper etter kontakt med rått kjøtt eller fisk.`;
}
function cookMain(id) {
  if (["beefsteak", "lambfilet"].includes(id))
    return "Brun alle overflatene på kjøttet i en varm panne med litt av fettet. Skru ned varmen og stek videre til ønsket stekegrad. La hele kjøttstykker hvile 5 minutter før de skjæres i skiver; hold rått kjøtt og redskaper atskilt fra ferdig mat.";
  if (id === "scampi")
    return "Stek scampi i en varm panne med litt av fettet i 2–3 minutter per side, til de er faste, rosa og ugjennomsiktige helt gjennom. Ferdigkokte scampi trenger bare gjennomvarming; følg pakken. Legg til side.";
  if (["chicken", "chickenmince"].includes(id))
    return "Stek kyllingen med litt av fettet til den er helt gjennomstekt; sjekk 75 °C i den tykkeste delen med termometer. Tiden varierer med størrelsen. Legg til side.";
  if (minces.has(id))
    return "Varm den ferdigstekte kjøttdeigen sammen med resten av retten til alt er gjennomvarmt.";
  if (fish.has(id))
    return "Stek fisken med litt av fettet på middels varme til kjøttet er gjennomstekt og deler seg i flak; tiden avhenger av tykkelsen. Legg til side.";
  if (id === "fishcake")
    return "Varm fiskekakene i litt av fettet på middels varme, 6–8 minutter eller etter pakken. Snu underveis.";
  if (id === "duck")
    return "Legg andebrystet med skinnet ned i en kald panne. Varm gradvis opp og stek 8–12 minutter til skinnet er sprøtt. Snu og stek videre til brystet er gjennomstekt; sjekk 75 °C med termometer. La hvile før du skjærer det i skiver.";
  if (id === "eggs")
    return "Hell de sammenvispede eggene i en panne med litt av fettet. Stek på middels lav varme og rør dem til eggerøre. Stek til eggene er stivnet helt og del i små biter.";
  if (id === "lentils")
    return "Vend inn de kokte linsene og varm dem sammen med resten av retten.";
  return "Stek kjøttet i litt av fettet på middels høy varme til det er brunet og gjennomstekt. Tykkere stykker kan etterstekes i ovn. La hvile 5 minutter og skjær i skiver.";
}

// New, complete recipes are assembled only from priced offer ingredients or
// explicitly recorded pantry stock, using compatible cooking methods.
export function createOfferRecipes(p, pool) {
  const quantity = (id, q) => (q * p.servings) / 2;
  const usable = (id, q) =>
    !p.dislikes.includes(id) &&
    (!!offerFor(id, quantity(id, q), pool, "luxury", Infinity, p) ||
      (p.pantry[id] || 0) >= quantity(id, q));
  const rank = (ids, q) =>
    ids
      .filter((id) => usable(id, q))
      .sort((a, b) => {
        const aa = offerFor(a, quantity(a, q), pool, "luxury", Infinity, p);
        const bb = offerFor(b, quantity(b, q), pool, "luxury", Infinity, p);
        return (
          (aa?.cost || 0) - (bb?.cost || 0) ||
          (bb?.dealScore || 0) - (aa?.dealScore || 0)
        );
      });
  const vegs = rank(vegetables, 200);
  const roots = rank(["potato", "sweetpotato"], 450);
  const grains = rank(["rice", "noodles"], 160);
  const fat = usable("butter", 20) ? "butter" : "oil";
  const accents = rank(["parmesan", "feta", "cheese"], 40);
  const result = [];
  for (const main of mains.filter((id) => usable(id, mainQuantity(id)))) {
    if (p.goals.includes("vegetarian") && !vegetarianMains.has(main)) continue;
    for (const style of ["tray", "pasta", "rice", "pan", "frittata"]) {
      if (style === "frittata" && main !== "eggs") continue;
      if (style !== "frittata" && main === "eggs" && style !== "rice") continue;
      if (
        style === "tray" &&
        ["scampi", "lentils", "duck", ...minces].includes(main)
      )
        continue;
      if (
        style === "rice" &&
        (main === "duck" || !grains.length || !usable("soy", 15))
      )
        continue;
      if (
        style === "pasta" &&
        (!usable("pasta", 160) || !usable("tomatoes", 300) || main === "duck")
      )
        continue;
      if (["pan", "tray", "frittata"].includes(style) && !roots.length)
        continue;
      for (let variant = 0; variant < Math.min(2, vegs.length); variant++) {
        const selectedVeg = [
          ...new Set([vegs[variant], vegs[(variant + 1) % vegs.length]]),
        ].filter(Boolean);
        if (selectedVeg.length < 2) continue;
        const ingredients = [[main, mainQuantity(main)]];
        const starch =
          style === "pasta"
            ? "pasta"
            : style === "rice"
              ? grains[variant % grains.length]
              : roots[variant % roots.length];
        ingredients.push([
          starch,
          ["pasta", "rice", "noodles"].includes(starch) ? 160 : 450,
        ]);
        for (const id of selectedVeg)
          ingredients.push([
            id,
            id === "redonion" || id === "leek" ? 120 : 220,
          ]);
        ingredients.push(
          [fat, fat === "butter" ? 20 : 15],
          ["salt", style === "rice" ? 1 : 3],
          ["blackpepper", 0.5],
        );
        if (style === "pasta") ingredients.push(["tomatoes", 300]);
        if (style === "rice") ingredients.push(["soy", 15]);
        const accent = accents.find(
          (id) => !ingredients.some(([ingredient]) => ingredient === id),
        );
        if (accent && ["pasta", "tray", "frittata"].includes(style))
          ingredients.push([accent, 40]);
        const mainName = main === "scampi" ? "Scampi" : INGREDIENTS[main][0];
        const vegetableNames = selectedVeg
          .map((id) => INGREDIENTS[id][0].toLowerCase())
          .join(" og ");
        const title =
          style === "pasta"
            ? `Tomatpasta med ${mainName.toLowerCase()}${accent ? " og " + INGREDIENTS[accent][0].toLowerCase() : ""}`
            : style === "rice"
              ? `Stekt ${INGREDIENTS[starch][0].split(",")[0].toLowerCase()} med ${mainName.toLowerCase()} og ${selectedVeg.map((id) => INGREDIENTS[id][0].toLowerCase()).join("/")}`
              : style === "frittata"
                ? `${INGREDIENTS[starch][0]}omelett med ${vegetableNames}${accent ? " og " + INGREDIENTS[accent][0].toLowerCase() : ""}`
                : `${mainName} med ${style === "tray" ? "ovnsbakt" : "grov mos av"} ${INGREDIENTS[starch][0].toLowerCase()} og ${vegetableNames}`;
        const steps = [prepareMain(main)];
        if (style === "pasta") {
          steps.push(
            "Kok pastaen etter pakken. Ta vare på litt kokevann. Skjær grønnsakene i små biter og stek dem i litt av fettet til de er møre.",
            "Tilsett de hakkede tomatene og la sausen småkoke i 8–10 minutter. Smak til med salt og pepper fra ingredienslisten.",
          );
          steps.push(
            cookMain(main),
            `Vend pasta, grønnsakssaus og ${mainName.toLowerCase()} sammen. Spe med litt pastavann til sausen legger seg rundt pastaen.${accent ? " Fordel osten over ved servering." : ""}`,
          );
        } else if (style === "rice") {
          steps.push(
            "Kok risen eller nudlene etter pakken og la dem dampe tørre. Skjær grønnsakene i små biter og stek dem med noe av fettet til de er møre og lett brunet.",
            cookMain(main),
            `Ha den kokte risen eller nudlene og ${mainName.toLowerCase()} i pannen. Tilsett soyasausen, resten av fettet og salt og pepper fra ingredienslisten. Vend på middels høy varme i 2–3 minutter og server gjennomvarmt.`,
          );
        } else if (style === "tray") {
          steps.push(
            "Sett ovnen på 220 °C. Skjær rotgrønnsakene i små biter. Del de øvrige grønnsakene. Fordel på et brett med fettet og salt og pepper fra ingredienslisten.",
            "Stek grønnsakene i 20–25 minutter og vend underveis. Ta mørere grønnsaker av brettet hvis de blir ferdige tidligere.",
            cookMain(main),
            `Server kjøttet eller fisken sammen med de møre grønnsakene.${accent ? " Fordel osten over de varme grønnsakene ved servering." : ""}`,
          );
        } else if (style === "frittata") {
          steps.push(
            "Del rotgrønnsakene i små biter og kok til møre, 12–15 minutter. Hell av vannet. Del og stek de andre grønnsakene i fettet til møre.",
            "Legg de kokte rotgrønnsakene i pannen og hell over de sammenvispede eggene. Stek på lav varme under lokk til eggemassen er stivnet helt, 8–12 minutter." +
              (accent ? " Fordel osten over de siste minuttene." : ""),
            "La omeletten sette seg et par minutter før du deler den. Server med de ferdigstekte grønnsakene.",
          );
        } else {
          steps.push(
            "Kok rotgrønnsakene i biter til møre, 15–20 minutter. Hell av vannet og mos grovt med litt kokevann, noe av fettet og salt og pepper fra ingredienslisten.",
            "Del de øvrige grønnsakene og stek dem i litt av fettet til møre og lett brunet.",
            cookMain(main),
            `Server ${mainName.toLowerCase()} med den grove rotmosen og grønnsakene. Hell eventuell stekesjy over retten.`,
          );
        }
        const recipe = {
          id: recipeId(JSON.stringify([style, main, ingredients])),
          title: title.slice(0, 100),
          time: style === "rice" || style === "pasta" ? 30 : 40,
          tags: [
            "nourishing",
            ...(vegetarianMains.has(main) ? ["vegetarian"] : []),
            ...(style === "pasta" ? ["comfort"] : ["healthy"]),
            ...(style === "rice" ? ["quick"] : []),
          ],
          ingredients,
          steps,
          tip: "Bygget fra de innsamlede råvarene. Brun grønnsakene ordentlig for mer smak, og bruk stekesjy eller pastavann i stedet for å kjøpe en ekstra saus. Tining kommer i tillegg til oppgitt tid.",
          createdByOffers: true,
          style,
          main,
          sourceOfferIds: [
            ...new Set(
              ingredients
                .map(
                  ([id, q]) =>
                    offerFor(id, quantity(id, q), pool, "luxury", Infinity, p)
                      ?.offer.id,
                )
                .filter(Boolean),
            ),
          ],
        };
        if (validGeneratedRecipe(recipe) && eligible(recipe, p))
          result.push(recipe);
      }
    }
  }
  return result;
}

export function planFromOffers(
  p,
  offers,
  stale,
  variation = 0,
  { replaceIndex } = {},
) {
  const pool = availableOffers(offers, p, stale);
  const newRecipes = createOfferRecipes(p, pool);
  const recipes = [
    ...new Map([...catalog(p), ...newRecipes].map((r) => [r.id, r])).values(),
  ];
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const planningProfile = {
    ...p,
    generatedRecipes: recipes.filter((r) => r.createdByOffers),
  };
  const oldRecipe = Number.isInteger(replaceIndex)
    ? p.plan[replaceIndex]
    : null;
  const allowed = recipes.filter((r) => eligible(r, p) && r.id !== oldRecipe);
  const scores = new Map(
    allowed.map((r) => [
      r.id,
      recipeScore(r, { ...p, planMode: "offers" }, pool),
    ]),
  );
  const ranked = allowed.sort((a, b) => scores.get(b.id) - scores.get(a.id));
  // Retain different proteins and techniques, alongside cheap high-coverage dishes.
  const candidates = [];
  const groups = new Map();
  for (const r of ranked) {
    const group = proteinGroup(r) + ":" + styleOf(r);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(r);
  }
  for (let layer = 0; layer < 2; layer++)
    for (const group of groups.values())
      if (group[layer]) candidates.push(group[layer]);
  const choices = candidates.slice(0, 64);
  const cache = new Map();
  const measure = (ids) => {
    const key = [...ids].sort().join("|");
    if (cache.has(key)) return cache.get(key);
    const items = basketWithPool({ ...planningProfile, plan: ids }, pool);
    const cov = coverage(items),
      cost = items.reduce((n, i) => n + i.cost, 0);
    const selected = ids.map((id) => recipeMap.get(id));
    const meals = mealCoverage(selected, items);
    const lowestMealCoverage = meals.length
      ? Math.min(...meals.map((m) => m.percent))
      : 0;
    const variety = menuVariety(selected);
    const proteins = selected.map(proteinGroup);
    const repeatPenalty = proteins.reduce(
      (n, id, i) =>
        n + (proteins.slice(0, i).filter((x) => x === id).length >= 2 ? 1 : 0),
      0,
    );
    const luxuryMeals = selected.filter((r) =>
      r.ingredients.some(
        ([id]) =>
          luxury.has(id) &&
          items.some(
            (i) => i.id === id && i.offer && comparison(i.offer).score >= 15,
          ),
      ),
    ).length;
    const organic = items.filter(
      (i) => i.offer && offerTraits(i.offer).organic,
    ).length;
    const rebate =
      items.reduce(
        (n, i) => n + (i.offer ? Math.max(0, comparison(i.offer).score) : 0),
        0,
      ) / Math.max(1, items.length);
    const preferences =
      selected.reduce(
        (n, r) =>
          n +
          r.tags.filter((t) => p.goals.includes(t)).length * 5 +
          r.ingredients.filter(([id]) => p.favorites.includes(id)).length * 4 +
          (p.saved.includes(r.id) ? 3 : 0) +
          ((p.ratings[r.id] || 3) - 3) * 4,
        0,
      ) +
      items.filter((i) => i.offer && p.selected.includes(i.offer.id)).length *
        12;
    const score =
      Math.min(OFFER_TARGET, lowestMealCoverage) * 100 +
      Math.min(OFFER_TARGET, cov.percent) * 50 +
      (p.preferVariety
        ? variety.proteins * 25 + variety.styles * 20 - repeatPenalty * 45
        : 0) +
      (p.planMode === "luxury" ? Math.min(3, luxuryMeals) * 25 : 0) +
      (p.preferOrganic ? organic * 8 : 0) +
      preferences +
      (p.planMode === "discounts" ? rebate * 1.5 : rebate * 0.2) -
      cost * (p.planMode === "offers" ? 0.45 : 0.2) -
      (p.budget > 0 ? Math.max(0, cost - p.budget) * 50 : 0);
    const data = {
      items,
      coverage: cov,
      cost,
      variety,
      score,
      luxuryMeals,
      organic,
      meals,
      lowestMealCoverage,
    };
    cache.set(key, data);
    return data;
  };
  const seed = Array(p.days).fill(null);
  const locked = Number.isInteger(replaceIndex)
    ? p.plan.map((_, i) => i).filter((i) => i !== replaceIndex)
    : p.locked;
  for (const index of locked)
    if (index < p.days && eligible(recipeMap.get(p.plan[index]), p))
      seed[index] = p.plan[index];
  let beam = [seed];
  for (let day = 0; day < p.days; day++) {
    if (seed[day]) continue;
    const trials = [];
    for (const ids of beam)
      for (const r of choices) {
        if (!p.allowRepeats && ids.includes(r.id)) continue;
        const next = [...ids];
        next[day] = r.id;
        trials.push(next);
      }
    if (!trials.length) continue;
    const seen = new Set();
    const ordered = trials.sort(
      (a, b) =>
        measure(b.filter(Boolean)).score - measure(a.filter(Boolean)).score,
    );
    beam = ordered
      .filter((ids) => {
        const key = ids.filter(Boolean).sort().join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
    // Keep the cheapest path as a budget escape route.
    const cheapest = trials.reduce(
      (best, ids) =>
        measure(ids.filter(Boolean)).cost < measure(best.filter(Boolean)).cost
          ? ids
          : best,
      trials[0],
    );
    if (!beam.includes(cheapest)) beam.push(cheapest);
  }
  const baseline = makePlan(
    { ...p, planMode: p.planMode === "luxury" ? "offers" : p.planMode },
    offers,
    stale,
    variation,
  );
  const proposals = [
    ...beam.map((ids) => ids.filter(Boolean)),
    ...(oldRecipe ? [] : [baseline]),
  ];
  const usable = proposals.filter(
    (ids) =>
      ids.length === p.days &&
      measure(ids).coverage.percent >= OFFER_TARGET - 0.001 &&
      measure(ids).lowestMealCoverage >= OFFER_TARGET - 0.001 &&
      (!p.budget || measure(ids).cost <= p.budget + 0.001),
  );
  const selected =
    (usable.length ? usable : proposals).sort(
      (a, b) => b.length - a.length || measure(b).score - measure(a).score,
    )[0] || [];
  const data = measure(selected);
  const generated = newRecipes.filter((r) => selected.includes(r.id));
  return {
    plan: selected,
    generatedRecipes: generated,
    report: {
      target: OFFER_TARGET,
      achieved: data.coverage.percent,
      cost: data.cost,
      metTarget:
        data.coverage.percent >= OFFER_TARGET - 0.001 &&
        data.lowestMealCoverage >= OFFER_TARGET - 0.001 &&
        selected.length === p.days,
      meals: data.meals,
      lowestMealCoverage: data.lowestMealCoverage,
      withinBudget: !p.budget || data.cost <= p.budget + 0.001,
      generated: generated.length,
      recipesCreated: newRecipes.length,
      luxuryMeals: data.luxuryMeals,
      organic: data.organic,
      variety: data.variety,
      missing: data.coverage.missing.map((i) => i.name),
    },
  };
}

export function keepGeneratedRecipes(p, added, plan) {
  const keep = new Set([
    ...p.saved,
    ...Object.keys(p.ratings),
    ...Object.keys(p.notes),
    ...plan,
  ]);
  return [
    ...new Map(
      [...(p.generatedRecipes || []), ...added].map((r) => [r.id, r]),
    ).values(),
  ].filter((r) => keep.has(r.id));
}
