# Weyra Atlas S4 — Radar Foundation

## Décision produit

- **Météo-France devient la source radar primaire pour la France.**
- RainViewer reste uniquement un fallback de développement / hors-France.
- La carte garde MapLibre + données OpenStreetMap : le fond et le radar sont deux systèmes séparés.

## Correctif immédiat

Le message `Zoom Level Not Supported` venait du fait que RainViewer accepte au maximum le zoom raster `z=7`, alors que S3 annonçait `maxzoom: 8`. S4 force la source à `maxzoom: 7`; MapLibre utilise alors la dernière tuile disponible pour les zooms de carte plus proches.

## Architecture S4

```text
Navigateur Atlas
   ↓ /api/radar/timeline
Gateway Next.js Weyra (pas de secret public)
   ↓
Adapter radar Weyra
   ↓
Données radar Météo-France 5 min + cache/tiles Weyra
```

## Contrat adapter

```json
{
  "host": "https://cdn.weyra.fr/radar",
  "radar": { "past": [
    { "time": 1782653700, "path": "/fr/2026-06-28/1340" }
  ] },
  "provider": "meteofrance",
  "cadenceMinutes": 5
}
```

Le client Atlas ne connaît jamais la clé Météo-France.
