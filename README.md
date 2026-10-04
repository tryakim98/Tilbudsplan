# Tilbudsplan

Tilbud, personlig kokebok og en praktisk middagsuke. Videreutviklet fra prototypen fra 22. september 2026.

## Funksjoner

- Uformelle profiler uten e-post/passord. En tilfeldig personlig lenke åpner profilen på en annen enhet. Kun SHA-256 av nøkkelen lagres i databasen.
- Varig lagring av kokebok, stjerner, notater, preferanser, ukeplan og avkryssinger i Sites D1. Nettleseren husker bare profilnøkkelen.
- 16 komplette oppskrifter for to, skalert til valgt porsjonsantall.
- Lagrede retter, vurderinger og favorittråvarer påvirker rangeringen. Uønskede råvarer og vegetarvalg er harde begrensninger.
- Kategorier for kjapt, billig, næringsrikt, grønnsaksrikt/sunt, lettere/slankende, vegetar og kosemat. Dette er redaksjonelle etiketter, ikke beregnet næringsinnhold eller helsepåstander.
- Handleliste summerer råvarer på tvers av måltider og runder opp hele pakninger. Viser rester, tilbudspris versus anslag og hvilke varer som allerede er avkrysset.
- JSON-eksport/import, personlig lenke, ren app-lenke og deling av oppskrifter uten profilnøkkel.

## Kilder og kjente begrensninger

Appen forsøker å lese `latest-data.json` fra [Olewol/tilbudsavis](https://github.com/Olewol/tilbudsavis), med et eldre lokalt snapshot som fallback. Den har ikke egen innsamler fra eTilbudsavis ennå. Data eldre enn sju døgn vises som arkiv, uten å brukes som dagens tilbudspriser. Ny hentetid er ikke bevis for gyldighet: lokale priser, utvalg og utløpsdato må kontrolleres i kundeavisen. Ferske datasett merkes derfor også med dette forbeholdet.

Kun tydelige produkt- og pakningsmatcher brukes til tilbudspris. Uklare multipakker, prosenttilbud og avrent mengde brukes ikke til prisregning. Prisene i råvareregisteret er illustrerende anslag, ikke observerte normalpriser. Ingen dokumentert besparelse eller laveste-pris-garanti beregnes. Valg av butikker er en enkel rangering, ikke en full kurvoptimalisering. Planen er ikke allergisikker. Ingen sensitive opplysninger bør lagres i en profil.

Tilgang til nettstedet styres separat fra app-profilene. Eksisterende private publisering beholdes inntil eieren velger å åpne app-lenken eller invitere venner. Personlige lenker skal ikke deles med venner; app-lenken og oppskriftslenker inneholder ikke profilnøkkelen.

## Utvikling

```sh
npm ci
npm test
npm run build
```

- `dist/index.html`, `dist/app.js`, `dist/engine.js`, `dist/recipes.js`, `dist/styles.css`: beholdt statisk frontend med ES-moduler.
- `worker/index.js`: Cloudflare-kompatibel Worker med profil-API, validering, prepared SQL og optimistisk versjonskontroll.
- `db/schema.ts` og `drizzle/`: skjema og genererte migreringer. Produksjonsmigreringer er append-only etter publisering.
- `scripts/build.mjs`: pakker frontend og eksisterende bilde inn i Worker. `dist/server` og `dist/.openai` er generert og ignoreres i Git.
- `.openai/hosting.json`: samme Sites-prosjekt med D1-binding `DB`.

Testene kjører plan-/prismotoren, profillagring med ekte SQLite og frontendflyten i en simulert DOM. De erstatter ikke visuell nettleser- eller mobiltesting. En vanlig statisk webserver kan vise frontend, men varig profillagring krever Worker og D1.

Neste prioritet: egen kildeinnsamling med per-tilbud-gyldighet og sted, flere oppskrifter og kontrollerte pakningspriser. Smak og praktisk handling er viktigere enn størst mulig funksjonsliste.
