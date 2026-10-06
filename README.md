# Tilbudsplan

Tilbud, personlig kokebok og en praktisk middagsuke. Videreutviklet fra prototypen fra 22. september 2026.

## Funksjoner

- Uformelle profiler uten e-post/passord. En tilfeldig personlig lenke åpner profilen på en annen enhet. Kun SHA-256 av nøkkelen lagres i databasen.
- Varig lagring av kokebok, stjerner, notater, preferanser, ukeplan og avkryssinger i Sites D1. Nettleseren husker bare profilnøkkelen.
- 20 grunnoppskrifter og nye, komplette oppskrifter som settes sammen fra prisede råvarer i tilbudsavisene. Nye retter har mengder, fremgangsmåte og tilberedningstid, skaleres med porsjoner og kan lagres, vurderes, deles eller tilpasses som egne oppskrifter. Lagrede, vurderte og kommenterte tilbudsoppskrifter beholdes når menyen byttes; inntil 100 per profil.
- Tilbudene hentes før menyen velges. Standard er sju middager, alle tilgjengelige kjeder og «God mat billig», med variasjon og små luksusfunn. Nye oppskrifter inngår i søket. En automatisk plan erstatter bare den gamle når minst 80 % av de ulike handlevarene i hver middag og i den samlede handlelisten er på tilbud og hele pakningskostnaden er innenfor valgt budsjett. Andelen teller varer som må kjøpes, ikke kilo eller andel av budsjettet. En råvare utelates fra middagens andel bare når beholdningen hjemme dekker hele ukas samlede behov; samme beholdning brukes ikke flere ganger. Salt, pepper og olje teller når de mangler hjemme. Annonserte faste lavpriser teller ikke som tilbud uten et oppgitt avslag.
- Full tilbudsoversikt, uavhengig av råvareregisteret: vanlige priser, medlems-/apppriser, prosenttilbud og varer uten passende oppskrift. Søk, sortering og sider med 60 varer; alle innsamlede data er tilgjengelige for planleggeren.
- Direkte innsamling fra eTilbudsavis og avisdataene hos Tjek: hele det norske dagligvareregisteret, alle publiserte avisvarianter og paginering til en tom sluttside. Fremdrift og dekningsrapport per avis, inkludert antallsavvik, kildefeil og manglende registrerte tilbud.
- Ingen automatisk ukeplan ved uferdig henting eller feil i kilden. Antallsavvik i avisens metadata stopper også automatisk planlegging og beholder den gamle planen. Når alle sider er gjennomgått uten hente- eller lagringsfeil, kan brukeren uttrykkelig velge «Bruk ufullstendig grunnlag likevel». Planen merkes da tydelig med ufullstendig grunnlag. Hente- og lagringsfeil tillater ikke dette valget. Kravet om 80 % og eventuelt budsjett gjelder også da.
- Avbrutt henting fortsetter automatisk etter oppdatering av samme nettleserfane. Nettverksfeil prøves igjen på samme hentesteg; ved vedvarende feil vises «Fortsett henting». Tid brukt og venting på serversvar vises underveis. Ferdige aviser og prisobservasjoner beholdes på serveren.
- Valg mellom «God mat billig», smak, høy tilbudsandel og dokumentert rabatt. Økologiske varer må være uttrykkelig merket i kilden. I «God mat billig» kan de prioriteres ved høyst 10 % høyere pakningskostnad for samme råvare, innenfor budsjettet. Variasjon vurderes etter både hovedråvare og tilberedningsmåte. Rabattsøket vurderer hele pakninger og bruker billigere alternativer når de største prosentavslagene sprenger budsjettet. Medlems- og apppriser krever eget valg per kjede.
- Tilbud viser pakningspris, oppgitt eller utledet førpris, rabatt i kroner og prosent, og en begrunnet vurdering. Kjedene vises uten filialnavn, og alle kjeder i kilden kan brukes.
- Varig ukentlig prishistorikk i D1, tilbakefylling av tilgjengelige arkiver og rullerende sammenligning av samme produkt, kjede og pakning siste 365 dager. Manglende uker regnes ikke som normalpriser.
- Tilbudspriser arkiveres under innsamlingen, også når man prøver appen uten personlig profil. Samme pris i flere aviser eller gjentatte hentinger gir ikke flere stemmer til én uke. Innsamling mens appen er lukket krever en aktiv planlagt oppgave.
- Egne oppskrifter med strukturerte råvarer, mengder, trinn, kategorier, redigering og tekst som kan deles med venner. Inntil 50 egne oppskrifter per profil.
- Råvarer hjemme trekkes fra det samlede handlebehovet. «Hva kan jeg lage av dette?» finner retter som mangler høyst tre råvarer.
- Budsjett for hele planen, maksimal tilberedningstid og middager som kan låses før resten av planen byttes. Budsjettet er et søkemål; appen sier fra når det ikke nås.
- Egne tilbud med pakningspris, valgfri førpris, mengde, kjede, datoer, eventuell medlemspris og kildelenke. Egne gyldige tilbud virker selv om felles tilbudskilde er gammel.
- Lagrede retter, vurderinger og favorittråvarer påvirker rangeringen. Uønskede råvarer og vegetarvalg er harde begrensninger.
- Kategorier for kjapt, billig, næringsrikt, grønnsaksrikt/sunt, lettere/slankende, vegetar og kosemat. Dette er redaksjonelle etiketter, ikke beregnet næringsinnhold eller helsepåstander.
- «Ukas handleliste» finnes i toppmenyen og som tydelig knapp ved ukeplanen. Handlelisten summerer råvarer på tvers av måltider og runder opp hele pakninger. Viser rester, tilbudspris versus anslag, det du har hjemme og det som allerede er handlet. Hele anslaget står fast når varer krysses av. Kopiering og utskrift er tilgjengelig.
- JSON-eksport/import, personlig lenke, ren app-lenke og deling av oppskrifter uten profilnøkkel.

## Kilder og kjente begrensninger

Appen henter direkte fra [eTilbudsavis](https://etilbudsavis.no/), med supplerende avisdata fra Tjeks offentlige lesegrensesnitt. Kjeder oppdages fra hele det norske dagligvareregisteret, uten en fast liste på ni kjeder. Alle publiserte avisvarianter undersøkes; regionale aviser velges ikke bort. Offentlig nettsted og eldre avisgrensesnitt kan eksponere forskjellige tilbud, så deres produkt-ID-er slås sammen. Paginering fortsetter til kilden svarer tomt, også etter korte sider. Gjentatte sider og kapasitetsgrenser rapporteres som feil, aldri som fullført dekning.

Dette er ikke en garanti for absolutt alle trykte tilbud eller alle butikker i Norge. En kilde kan mangle varer, registrere feil antall eller ikke ha en kjede. Appen sammenligner antallet unike produkt-ID-er i hver avis med kildens `offer_count`. Uferdige sider, feil i kilden og avvik mellom kildens antall og de faktiske sidene stopper automatisk planlegging. Både færre og flere varer enn forventet regnes som avvik. Begge kildegrensesnittene pagineres til en tom sluttside for hver avis, også når det første når forventet antall. «Bruk ufullstendig grunnlag likevel» vises bare etter avsluttet ufullstendig innsamling uten hente- eller lagringsfeil, også når siden åpnes på nytt, med en forklaring av avviket. Hvis den avsluttede innsamlingen er eldre enn fem minutter, kontrolleres tilbudene på nytt før planlegging; hente-/lagringsfeil gir ikke en ny plan.

En pågående innsamlingsjobbs nøkkel huskes bare i fanens `sessionStorage`, separat fra profilnøkkelen. Den slettes etter avsluttet henting og utløper lokalt etter én time eller når dagen endres. Profildata lagres fortsatt i D1. Siden må være åpen for at nye hentesteg skal kjøres; gjenopptakelse er ikke en bakgrunnsoppgave. «Hent og kontroller alle tilbud» starter en helt ny innsamling.

Avisregisteret leses på nytt før hver automatisk generering. Allerede fullførte sidehentinger fra siste 15 minutter kan gjenbrukes når avis-ID, kjede, antall og gyldighetsdatoer er uendret, samme dag. Ingen avvik fjernes ved gjenbruk, og datadatoen er den eldste faktiske hentetiden. Resultater fra eldre versjoner av innsamleren gjenbrukes ikke; begge kildegrensesnitt må kontrolleres på nytt. «Hent og kontroller alle tilbud» tvinger ny henting av alle sider. Første fullstendige gjennomgang kan ta flere minutter. Kilden kan også ha sin egen mellomlagring.

`/api/offers` leser sist avsluttede innsamling og lagret historikk. Før første direkte henting brukes den tidligere [Olewol/tilbudsavis](https://github.com/Olewol/tilbudsavis)-kilden og et gammelt lokalt snapshot som fallback, tydelig merket uten bekreftet full dekning. Per-tilbud-datoer kontrolleres i planmotoren. Visning av kjedenavn gjør ikke lokale tilbud landsdekkende.

Direkte innsamling lagrer tilbudspriser per ISO-uke, kjede, produkt, pakning og tilgangstype. Gjennomsnittet av en ukes ulike priser får én stemme i historikken; gjentatte observasjoner og regionale kopier dobbelttelles ikke. Inneværende uke utelates. Minst fire tidligere uker kreves før vurderingen bruker historikken; ellers brukes dokumentert annonserabatt. Den gamle, beskyttede arkivruten er beholdt. «Tilbudssnitt» gjelder observerte tilbudspriser og er ikke markedets historiske normalpris eller et komplett årssnitt. Se [instruksjoner for løpende innsamling](docs/PRICE-UPDATER.md).

Kun tydelige produkt- og pakningsmatcher brukes i prisanslaget. Strukturerte vektintervaller, uklare mengde-/flerkjøpsvilkår, prosenttilbud uten konkret pris og ukjent avrent mengde vises uten å brukes til prisregning. Motstridende pakningspris og enhetspris utelukkes fra anslag og historikk. Råvareregisterets priser er illustrerende anslag. Annonsert avslag summeres bare for handlelinjer med sammenlignbar førpris; øvrige linjer har ukjent rabatt.

I rabattmodus velges størst dokumentert prosentavslag eller avvik under et tilstrekkelig historisk tilbudssnitt, med pakningskostnad som neste hensyn. Høy prosent betyr ikke alltid lavest butikkpris. Ved budsjett brukes rimeligere alternativer og et begrenset søk etter bedre rabatt innenfor rammen. Planvalg prioriterer tilbudsandel før rabatt, og harde råvarevalg/tidsgrenser overholdes. Nye retter bygges med passende kombinasjoner av hovedråvare, grønnsaker, tilbehør og tilberedningsmåte. Et begrenset søk sammenligner hele ukehandlekurver, med harde krav om 80 % både per middag og samlet, og eventuelt budsjett før en ny automatisk plan godtas. Hvis ingen funnet kombinasjon når kravene, beholdes den gamle planen med en konkret forklaring. Ingen matematisk global optimalitet garanteres. Butikkombinasjoner undersøkes uttømmende ved inntil åtte kjeder; med flere og en butikkgrense brukes grådig søk. Anslagsvarer er ikke knyttet til en butikk. Planen er ikke allergisikker. Ingen sensitive opplysninger bør lagres i en profil.

Nettstedet er åpnet for alle med app-lenken etter eierens ønske, uten ChatGPT-innlogging. Profiler har egne personlige lenker. Alle med en personlig lenke kan lese og endre akkurat den profilen. Del den vanlige app-lenken med venner, slik at de kan opprette hver sin profil.

Beholdningen hjemme endres manuelt; den trekkes ikke automatisk ned etter matlaging. Oppskriftsmengdene gjelder to porsjoner ved registrering. Mengder i egne friteksttrinn må tilpasses når porsjonsantallet endres. Egne tilbud er brukerregistrerte og ikke eksternt kontrollert.

## Utvikling

```sh
npm ci
npm test
npm run build
```

- `dist/index.html`, `dist/app.js`, `dist/collection-client.js`, `dist/offer-planner.js`, `dist/engine.js`, `dist/model.js`, `dist/recipes.js`, `dist/offers.js`, `dist/styles.css`: beholdt statisk frontend med ES-moduler. Innsamlingsklienten håndterer gjenopptakelse og gjentakelser av samme serverjobb. Frontend og Worker deler profilvalidering, prisgrunnlag og standardverdier for eldre profiler.
- `worker/index.js`, `worker/offers.js`, `worker/collection.js`: Worker med profil-API, direkte paginert innsamling, dekningskontroll, prishistorikk og offentlige lesedata. Hver innsamlingsjobb har sin egen tilfeldige nøkkel; bare dens hash lagres. Klienten kan ikke sende varer, kilde-URL eller priser til innsamleren. Profiler og jobbnøkler er separate.
- `db/schema.ts` og `drizzle/`: skjema og genererte migreringer. Produksjonsmigreringer er append-only etter publisering.
- `scripts/build.mjs`: pakker frontend og eksisterende bilde inn i Worker. `dist/server` og `dist/.openai` er generert og ignoreres i Git.
- `.openai/hosting.json`: samme Sites-prosjekt med D1-binding `DB`.

Testene kjører plan-/prismotoren, profillagring med ekte SQLite og frontendflyten i en simulert DOM. De erstatter ikke visuell nettleser- eller mobiltesting. En vanlig statisk webserver kan vise frontend, men varig profillagring krever Worker og D1.

Manuelle menyendringer, utløpte tilbud og endrede preferanser kan senke tilbudsandelen i en eksisterende plan; det vises med nytt beregnet resultat både per middag og for hele handlelisten. Stramme tidsgrenser, låste retter, få tillatte kjeder eller et lavt budsjett kan gjøre en ny automatisk plan umulig. Lav pris eller økologisk merking er ikke en garanti for næringsinnhold. Tilberedningsrådene bygger blant annet på [Mattilsynets råd om varmebehandling](https://www.mattilsynet.no/mat-og-drikke/matservering/mathandtering-hygiene/varm-mat-skal-vaere-rykende-varm).
