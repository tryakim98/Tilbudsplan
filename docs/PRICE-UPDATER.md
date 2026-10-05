# Løpende innsamling av tilbudspriser

Nettsted: https://tilbudsplan.tju98.chatgpt.site

Sites-prosjekt: `appgprj_6ab26f207a788191bf62c5f4b46b6ed4`

Dette er instruksjonen for en senere automatisk kjøring. Den skal bare hente og registrere reelle tilbud fra den faste, offentlige kilden. Ikke opprett profiler, testprodukter eller oppdiktede priser.

1. Les denne instruksjonen fra `tryakim98/Tilbudsplan` på GitHub, `docs/PRICE-UPDATER.md`, ref `main`.
2. Kall Sites `get_site` med prosjekt-ID-en over. Hent `siwc_bypass_bearer_token` fra resultatet. Dette er en hemmelighet: ikke logg, skriv til fil eller ta den med i rapporten.
3. Utled den appspesifikke oppdateringsnøkkelen som små bokstaver i hex: `SHA-256("tilbudsplan-price-history-v1:" + siwc_bypass_bearer_token)`. Runtime-hemmeligheten `OFFERS_UPDATE_KEY` er satt til denne verdien. Ikke erstatt den med en profilnøkkel.
4. Kall `POST https://tilbudsplan.tju98.chatgpt.site/api/offers/refresh` med `Authorization: Bearer <utledet nøkkel>` og `OAI-Sites-Authorization: Bearer <siwc_bypass_bearer_token>`. Sistnevnte er Sites sin tjenestetilgang for automatisk kjøring; den utledede nøkkelen autoriserer skriving i appen. Ingen forespørselskropp kreves. Send hemmelighetene bare til dette nettstedet, aldri til kilden eller GitHub. Bruk et verktøy som kan gjøre HTTP-kallet uten å vise hemmelige headere i output.
5. Kontroller HTTP 200 og `updated: true`. Hent deretter `GET /api/offers` på samme origin. Bekreft at `meta.generated` svarer til `sourceGenerated`, og at `meta.historyWeeks` er positiv. Rapportér kildeuke, antall lagrede uker og eventuelle `archiveErrors`. En gammel eller mislykket kilde skal ikke omtales som nye tilbud.
6. Ved feil: behold eksisterende historikk. Ikke endre offentlig tilgang, roter nøkler eller slett rader. Meld fra om konkret HTTP-feil eller utilgjengelig kilde uten hemmeligheter.

Oppdateringen leser bare `https://raw.githubusercontent.com/Olewol/tilbudsavis/main/latest-data.json` og `data_ukeNN.json` fra samme repository. GitHubs innholds-API brukes til å finne arkivene. Manglende arkivuker forsøkes på nytt ved senere kjøring. Koden avviser ugyldige datoer og bruker ikke priser med motstridende enhetspris i historiske sammenligninger.

Databasen lagrer ett snapshot per ISO-uke i `offer_snapshots`. Like eller eldre kildeversjoner endrer ikke den lagrede uken. Nye uker bygger historikken videre. Nettleserens «Oppdater» henter de ferskeste dataene til visning; det beskyttede skrivekallet over står for varig innsamling.

Årssammenligningen gjelder registrerte tilbudspriser i samme kjede, produkt og pakning de siste 365 dagene. Den aktuelle uken holdes utenfor snittet. En uke uten observasjon er ukjent, og må ikke fylles med en antatt normalpris.
