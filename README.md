# Weyra Atlas — app web S4 Radar Foundation

Atlas est la vraie application web de Weyra : **Next.js + TypeScript + MapLibre GL**. La carte est le produit principal ; toutes les informations doivent rester flottantes, légères et lisibles au-dessus du radar.

## Cette version fait réellement

- Carte WebGL vectorielle MapLibre, cadrée par défaut sur les Hauts-de-France / Belgique.
- Style Atlas bleu nuit : eau, frontières, routes et labels sont retouchés directement dans le style vectoriel.
- Météo actuelle + recherche de ville avec Open-Meteo.
- Radar animé avec double-buffer / fondu entre trames.
- Correctif RainViewer : le source raster est strictement plafonné à z=7 ; MapLibre surzoome la dernière tuile valide au lieu de demander des tuiles interdites.
- Vérification de la timeline radar toutes les minutes.
- Clusters MapLibre aux zooms éloignés.
- Petits points événementiels au zoom régional.
- Pastilles **photo** seulement pour les images réelles publiées par les utilisateurs, à un zoom local.
- Publication locale immédiate ou synchronisation via Supabase.

## Point honnête sur le radar

L'application peut vérifier une nouvelle timeline toutes les minutes, mais une nouvelle mesure météo dépend toujours de la source. En mode par défaut, Atlas utilise le fallback public RainViewer : il est utile pour le prototype, mais ne garantit pas le produit France à 5 minutes attendu pour une ouverture publique.

Pour la cible Weyra France : **oui, Météo-France doit devenir la source primaire**. Atlas appelle maintenant `/api/radar/timeline`, un gateway Next.js serveur. Configure `WEYRA_RADAR_TIMELINE_URL` vers un adapter Weyra privé qui récupère la donnée Météo-France autorisée, met les trames 5 minutes en cache/CDN et renvoie une timeline normalisée. Les identifiants Météo-France ou d'un fournisseur ne doivent jamais apparaître dans le front-end.

## Installation

```bash
npm install
npm run dev
```

Puis ouvre `http://localhost:3000`.

Contrôles :

```bash
npm run check
npm run build
```

## Radar Lab local

Le Radar Lab convertit localement une vraie trame OPERA DBZH ODIM HDF5 en image WebP transparente. La clé MeteoGate reste uniquement côté serveur dans `.env.local` via `METEOGATE_API_KEY`.

Commandes Windows PowerShell :

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r radar-worker\requirements.txt
python -c "import h5py, numpy, PIL, pyproj; print('radar worker ok')"
npm run dev
```

Puis ouvre `http://localhost:3000/radar-lab` et clique sur `Rendre la dernière trame`.

Si Python n'est pas dans le `PATH`, pointe Next.js vers un exécutable explicite avant de lancer le serveur :

```powershell
$env:PYTHON_BIN="C:\chemin\vers\python.exe"
npm run dev
```

## Variables d'environnement

Copie `.env.example` en `.env.local`.

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
WEYRA_RADAR_TIMELINE_URL=https://ton-worker.example/api/radar/timeline
```

- Sans Supabase : les observations sont uniquement stockées dans le navigateur local.
- Avec Supabase : observations et photos deviennent partagées en temps réel.
- Sans `WEYRA_RADAR_TIMELINE_URL` : le fallback RainViewer 10 minutes est utilisé.

## Avant une ouverture publique

- Auth Supabase obligatoire et `user_id` sur chaque observation.
- Modération images/texte, anti-spam, limite d’envoi, signalement.
- Géolocalisation arrondie par défaut et politique de rétention.
- Fournisseur radar à usage commercial / contrat de données adapté.
- Backend cache/CDN pour ne jamais exposer de clé fournisseur au navigateur.

## Fichiers importants

- `components/atlas/AtlasMap.tsx` — moteur de carte, clusters, pastilles photo, rendu radar.
- `components/atlas/AtlasApp.tsx` — données live, timeline, UI Atlas et adapter radar.
- `components/atlas/ObservationDrawer.tsx` — création d'une observation.
- `components/atlas/ObservationDetail.tsx` — popup social.
- `app/globals.css` — système visuel Atlas.
- `ATLAS-S3.md` — règles de design et critères de validation.
- `supabase/schema.sql` — bêta communautaire.
