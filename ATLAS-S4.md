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

## Scan packs radar OPERA (S4 Radar Foundation)

Chaque scan OPERA prêt est publié sous forme de **scan pack** statique :

```text
.radar-cache/packs/v1/<timestamp>/
  manifest.json        # status "ready" uniquement si TOUTES les tuiles overview existent
  overview/{z}/{x}/{y}.webp   # z3..z7, emprise OPERA Europe, palette V3b
  detail/                     # les tuiles detail (z8..z11) restent dans le cache tuiles partagé
```

- Publication **atomique** : génération dans `packs/v1/.building/…`, validation de chaque tuile,
  écriture du manifest, puis `rename` vers le dossier final. Atlas ne voit jamais un pack partiel.
- Routes de lecture pure (`/api/radar/opera/packs/...`) : zéro Python, zéro rasterio, zéro HDF5,
  zéro MeteoGate, `Cache-Control: immutable`. Une tuile detail absente répond 404 immédiatement.
- `ensureRadarScanPacks()` (lib/server/opera-packs.ts) détecte les scans, construit les packs
  manquants (max 2 process Python, source-grid ouvert une fois par scan), conserve les
  `WEYRA_RADAR_MAX_PACKS` (16) packs les plus récents.

**Local** : appelé au démarrage serveur (`instrumentation.ts`) et via
`POST /api/radar/opera/packs/maintenance`.

**PRODUCTION** : ce mécanisme doit tourner dans un **worker/cron permanent** (toutes les 1 à
2 minutes), jamais déclenché par le navigateur.
