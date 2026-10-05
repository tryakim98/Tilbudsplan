# Tilbudsplan

Tilbud, personlig kokebok og en praktisk middagsuke. Videreutviklet fra prototypen fra 22. september 2026.

## Funksjoner

- Uformelle profiler uten e-post/passord. En tilfeldig personlig lenke åpner profilen på en annen enhet. Kun SHA-256 av nøkkelen lagres i databasen.
- Varig lagring av kokebok, stjerner, notater, preferanser, ukeplan og avkryssinger i Sites D1. Nettleseren husker bare profilnøkkelen.
- 20 komplette oppskrifter for to, skalert til valgt porsjonsantall, inkludert fire enkle retter med få tilleggsvarer.
- «Lag 7-dagers tilbudsuke med alle kjeder» prioriterer andelen varer med brukbar tilbudspris. Gjentatte middager kan tillates eller slås av. Visning av faktisk tilbudsandel, med et mål på minst 80 %, og alle varer uten tilbud i handlelisten. Andelen teller ulike råvarer som må kjøpes, ikke kilo eller andel av budsjettet.
- Tilbud viser pakningspris, oppgitt eller utledet førpris, rabatt i kroner og prosent, og en begrunnet vurdering. Kjedene vises uten filialnavn, og alle kjeder i kilden kan brukes.
- Varig ukentlig prishistorikk i D1, tilbakefylling av tilgjengelige arkiver og rullerende sammenligning av samme produkt, kjede og pakning siste 365 dager. Manglende uker regnes ikke som normalpriser.
- Egne oppskrifter med strukturerte råvarer, mengder, trinn, kategorier, redigering og tekst som kan deles med venner. Inntil 50 egne oppskrifter per profil.
- Råvarer hjemme trekkes fra det samlede handlebehovet. «Hva kan jeg lage av dette?» finner retter som mangler høyst tre råvarer.
- Budsjett for hele planen, maksimal tilberedningstid og middager som kan låses før resten av planen byttes. Budsjettet er et søkemål; appen sier fra når det ikke nås.
- Egne tilbud med pakningspris, valgfri førpris, mengde, kjede, datoer, eventuell medlemspris og kildelenke. Egne gyldige tilbud virker selv om felles tilbudskilde er gammel.
- Lagrede retter, vurderinger og favorittråvarer påvirker rangeringen. Uønskede råvarer og vegetarvalg er harde begrensninger.
- Kategorier for kjapt, billig, næringsrikt, grønnsaksrikt/sunt, lettere/slankende, vegetar og kosemat. Dette er redaksjonelle etiketter, ikke beregnet næringsinnhold eller helsepåstander.
- Handleliste summerer råvarer på tvers av måltider og runder opp hele pakninger. Viser rester, tilbudspris versus anslag, det du har hjemme og det som allerede er handlet. Hele anslaget står fast når varer krysses av. Kopiering og utskrift er tilgjengelig.
- JSON-eksport/import, personlig lenke, ren app-lenke og deling av oppskrifter uten profilnøkkel.

## Kilder og kjente begrensninger

Appens `/api/offers` leser lagret prishistorikk og `latest-data.json` fra [Olewol/tilbudsavis](https://github.com/Olewol/tilbudsavis), med et eldre lokalt snapshot som fallback. Den har ikke egen innsamler fra eTilbudsavis ennå. Data eldre enn sju døgn vises som arkiv, uten å brukes som dagens tilbudspriser. Ny hentetid er ikke bevis for gyldighet: lokale priser, utvalg og utløpsdato må kontrolleres i kundeavisen. Kilden dekker for tiden ni kjeder. Visningen bruker kjedenavn; det gjør ikke lokale tilbud automatisk landsdekkende.

Den beskyttede oppdateringsruten lagrer ett snapshot per ISO-uke. Nyere data i samme uke erstatter tidligere data i den uken. Tilbudshistorikken gir hver tidligere observert uke lik vekt, og utelater den aktuelle uken. Minst fire sammenlignbare tidligere uker kreves før vurderingen bruker historikken; ellers brukes dokumentert annonserabatt der den finnes. «Tilbudssnitt» er gjennomsnitt av observerte tilbudspriser, ikke markedets historiske normalpris eller et fullstendig årssnitt. Se [instruksjoner for løpende innsamling](docs/PRICE-UPDATER.md).

Kun tydelige produkt- og pakningsmatcher brukes til tilbudspris. Entydige multipakker som «4 × 125 g» kan regnes om; vektintervaller, blandede pakninger, prosenttilbud og ukjent avrent mengde brukes ikke til prisregning. Motstridende pakningspris og oppgitt enhetspris utelukkes fra prisregning og historikk. Prisene i råvareregisteret er illustrerende anslag, ikke observerte normalpriser. Annonsert rabatt merkes som sådan; det beregnes ingen garantert besparelse for hele kurven. Handlekurven sammenligner tillatte butikkombinasjoner når det er inntil åtte butikker; med flere brukes et begrenset, grådig søk. Maksgrensen gjelder tilbudsbutikker; anslagsvarer er ikke knyttet til en bestemt butikk. Budsjettsøket er begrenset og garanterer ikke matematisk laveste pris. Planen er ikke allergisikker. Ingen sensitive opplysninger bør lagres i en profil.

Nettstedet er åpnet for alle med app-lenken etter eierens ønske, uten ChatGPT-innlogging. Profiler har egne personlige lenker. Alle med en personlig lenke kan lese og endre akkurat den profilen. Del den vanlige app-lenken med venner, slik at de kan opprette hver sin profil.

Beholdningen hjemme endres manuelt; den trekkes ikke automatisk ned etter matlaging. Oppskriftsmengdene gjelder to porsjoner ved registrering. Mengder i egne friteksttrinn må tilpasses når porsjonsantallet endres. Egne tilbud er brukerregistrerte og ikke eksternt kontrollert.

## Utvikling

```sh
npm ci
npm test
npm run build
```

- `dist/index.html`, `dist/app.js`, `dist/engine.js`, `dist/model.js`, `dist/recipes.js`, `dist/offers.js`, `dist/styles.css`: beholdt statisk frontend med ES-moduler. Frontend og Worker deler profilvalidering, prisgrunnlag og standardverdier for eldre profiler.
- `worker/index.js`, `worker/offers.js`: Cloudflare-kompatibel Worker med profil-API, beskyttet tilbudsinnsamling, offentlig lese-API, prepared SQL og optimistisk versjonskontroll.
- `db/schema.ts` og `drizzle/`: skjema og genererte migreringer. Produksjonsmigreringer er append-only etter publisering.
- `scripts/build.mjs`: pakker frontend og eksisterende bilde inn i Worker. `dist/server` og `dist/.openai` er generert og ignoreres i Git.
- `.openai/hosting.json`: samme Sites-prosjekt med D1-binding `DB`.

Testene kjører plan-/prismotoren, profillagring med ekte SQLite og frontendflyten i en simulert DOM. De erstatter ikke visuell nettleser- eller mobiltesting. En vanlig statisk webserver kan vise frontend, men varig profillagring krever Worker og D1.

Neste prioritet: kildeinnsamling med per-tilbud-gyldighet og sted, større oppskriftsutvalg og flere kontrollerte pakningspriser. Tilbudsandelen kan være lavere ved tidsgrenser, låste retter, råvarer man ikke liker eller få tillatte kjeder.
