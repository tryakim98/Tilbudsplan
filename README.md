# Tilbudsplan

En privat, interaktiv middagsplanlegger som gjør ukens dagligvaretilbud om til en praktisk ukeplan og én samlet handleliste.

## Gjenbruk fra Olewol/tilbudsavis

Tilbudsplan bruker det åpne datasettet og flere av prinsippene fra [Olewol/tilbudsavis](https://github.com/Olewol/tilbudsavis):

- normaliserte tilbud fra eTilbudsavis
- butikk- og kategorifelter
- kvalitetsindikator og ukemetadata
- vurdering av dokumentert rabatt
- kildehenvisning og lokalt datasnapshot

Nettstedet forsøker å lese `latest-data.json` direkte fra kilderepoet og bruker den innbundne ukesfilen som fallback. Selve planleggingslaget, måltidsmalene, valgene og handlelisten ligger i dette repoet.

## Lokal bruk

Åpne `dist/index.html` via en lokal webserver, for eksempel:

```bash
python -m http.server 4173 --directory dist
```

Dataene eies av respektive kilder og butikker. Pris og tilgjengelighet bør dobbeltsjekkes før handling.
