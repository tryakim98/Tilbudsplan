# Tilbudsplan

Tilbud, personlig kokebok og en praktisk middagsuke. Videreutviklet fra prototypen fra 22. september 2026.

## Funksjoner

- Uformelle profiler uten e-post/passord. En tilfeldig personlig lenke åpner profilen på en annen enhet. Kun SHA-256 av nøkkelen lagres i databasen.
- Varig lagring av kokebok, stjerner, notater, preferanser, ukeplan og avkryssinger i Sites D1. Nettleseren husker bare profilnøkkelen.
- 16 komplette oppskrifter for to, skalert til valgt porsjonsantall.
- Egne oppskrifter med strukturerte råvarer, mengder, trinn, kategorier, redigering og tekst som kan deles med venner. Inntil 50 egne oppskrifter per profil.
- Råvarer hjemme trekkes fra det samlede handlebehovet. «Hva kan jeg lage av dette?» finner retter som mangler høyst tre råvarer.
- Budsjett for hele planen, maksimal tilberedningstid og middager som kan låses før resten av planen byttes. Budsjettet er et søkemål; appen sier fra når det ikke nås.
- Egne lokale tilbud med pakningspris, mengde, butikk, datoer, eventuell medlemspris og kildelenke. Egne gyldige tilbud virker selv om felles tilbudskilde er gammel.
- Lagrede retter, vurderinger og favorittråvarer påvirker rangeringen. Uønskede råvarer og vegetarvalg er harde begrensninger.
- Kategorier for kjapt, billig, næringsrikt, grønnsaksrikt/sunt, lettere/slankende, vegetar og kosemat. Dette er redaksjonelle etiketter, ikke beregnet næringsinnhold eller helsepåstander.
- Handleliste summerer råvarer på tvers av måltider og runder opp hele pakninger. Viser rester, tilbudspris versus anslag, det du har hjemme og det som allerede er handlet. Hele anslaget står fast når varer krysses av. Kopiering og utskrift er tilgjengelig.
- JSON-eksport/import, personlig lenke, ren app-lenke og deling av oppskrifter uten profilnøkkel.

## Kilder og kjente begrensninger

Appen forsøker å lese `latest-data.json` fra [Olewol/tilbudsavis](https://github.com/Olewol/tilbudsavis), med et eldre lokalt snapshot som fallback. Den har ikke egen innsamler fra eTilbudsavis ennå. Data eldre enn sju døgn vises som arkiv, uten å brukes som dagens tilbudspriser. Ny hentetid er ikke bevis for gyldighet: lokale priser, utvalg og utløpsdato må kontrolleres i kundeavisen. Ferske datasett merkes derfor også med dette forbeholdet.

Kun tydelige produkt- og pakningsmatcher brukes til tilbudspris. Uklare multipakker, prosenttilbud og ukjent avrent mengde brukes ikke til prisregning. Prisene i råvareregisteret er illustrerende anslag, ikke observerte normalpriser. Ingen dokumentert besparelse eller laveste-pris-garanti beregnes. Handlekurven sammenligner tillatte butikkombinasjoner når det er inntil åtte butikker; med flere brukes et begrenset, grådig søk. Maksgrensen gjelder tilbudsbutikker; anslagsvarer er ikke knyttet til en bestemt butikk. Budsjettsøket er begrenset og garanterer ikke matematisk laveste pris. Planen er ikke allergisikker. Ingen sensitive opplysninger bør lagres i en profil.

Nettstedet er åpnet for alle med app-lenken etter eierens ønske, uten ChatGPT-innlogging. Profiler har egne personlige lenker. Alle med en personlig lenke kan lese og endre akkurat den profilen. Del den vanlige app-lenken med venner, slik at de kan opprette hver sin profil.

Beholdningen hjemme endres manuelt; den trekkes ikke automatisk ned etter matlaging. Oppskriftsmengdene gjelder to porsjoner ved registrering. Mengder i egne friteksttrinn må tilpasses når porsjonsantallet endres. Egne tilbud er brukerregistrerte og ikke eksternt kontrollert.

## Utvikling

```sh
npm ci
npm test
npm run build
```

- `dist/index.html`, `dist/app.js`, `dist/engine.js`, `dist/model.js`, `dist/recipes.js`, `dist/styles.css`: beholdt statisk frontend med ES-moduler. Frontend og Worker deler profilvalideringen og standardverdiene for eldre profiler.
- `worker/index.js`: Cloudflare-kompatibel Worker med profil-API, validering, prepared SQL og optimistisk versjonskontroll.
- `db/schema.ts` og `drizzle/`: skjema og genererte migreringer. Produksjonsmigreringer er append-only etter publisering.
- `scripts/build.mjs`: pakker frontend og eksisterende bilde inn i Worker. `dist/server` og `dist/.openai` er generert og ignoreres i Git.
- `.openai/hosting.json`: samme Sites-prosjekt med D1-binding `DB`.

Testene kjører plan-/prismotoren, profillagring med ekte SQLite og frontendflyten i en simulert DOM. De erstatter ikke visuell nettleser- eller mobiltesting. En vanlig statisk webserver kan vise frontend, men varig profillagring krever Worker og D1.

Neste prioritet: egen kildeinnsamling med per-tilbud-gyldighet og sted, flere oppskrifter og kontrollerte pakningspriser. Smak og praktisk handling er viktigere enn størst mulig funksjonsliste.
