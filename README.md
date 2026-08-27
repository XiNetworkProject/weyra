# Weyra Atlas — app web S4 Radar Foundation

Atlas est la vraie application web de Weyra : **Next.js + TypeScript + MapLibre GL**. La carte est le produit principal ; toutes les informations doivent rester flottantes, légères et lisibles au-dessus du radar.

## Cette version fait réellement

- Carte WebGL vectorielle MapLibre, cadrée par défaut sur les Hauts-de-France / Belgique.
- Style Atlas bleu nuit : eau, frontières, routes et labels sont retouchés directement dans le style vectoriel.
- Météo actuelle + recherche de ville avec Open-Meteo.
- Radar animé avec double-buffer / fondu entre trames.
- Mosaïque Météo-France officielle DBZH à 1 km / 5 minutes, décodée côté serveur depuis le Package Radar BUFR.
- Composite EUMETNET OPERA DBZH européen utilisé comme couverture complémentaire et repli amont.
- Vérification de la timeline radar toutes les minutes.
- Clusters MapLibre aux zooms éloignés.
- Petits points événementiels au zoom régional.
- Pastilles **photo** seulement pour les images réelles publiées par les utilisateurs, à un zoom local.
- Publication locale de démonstration en attendant la plateforme PostgreSQL auto-hébergée Weyra.

## Point honnête sur le radar

Météo-France est maintenant la source primaire officielle sur la France métropolitaine. Le worker télécharge le Package Radar, décode la mosaïque `IMFR27` BUFR, conserve la réflectivité DBZH brute et produit les tuiles Web Mercator utilisées par Atlas. Le masque de probabilité de pluie fourni dans le produit est appliqué uniquement à l'affichage afin d'écarter les échos non météorologiques faibles. EUMETNET OPERA reste disponible pour l'Europe et comme repli si Météo-France est temporairement indisponible.

La production doit configurer `METEOFRANCE_APPLICATION_ID` côté serveur pour renouveler automatiquement le jeton OAuth horaire. Un `METEOFRANCE_ACCESS_TOKEN` manuel n'est qu'un secours local temporaire. Aucun identifiant fournisseur, jeton, paquet BUFR ou URL amont n'est envoyé au navigateur.

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
python -c "import h5py, numpy, PIL, pyproj, rasterio, mercantile; print('radar worker ok')"
npm run dev
```

`rasterio` et `mercantile` servent uniquement au pipeline local de tuiles Web Mercator OPERA. Sur Windows, `pip` installe normalement les wheels précompilés. Si l'installation échoue, mets d'abord `pip` à jour puis relance :

```powershell
python -m pip install --upgrade pip setuptools wheel
python -m pip install rasterio mercantile
```

Le cache radar local est écrit dans `.radar-cache/` et reste ignoré par Git.

Puis ouvre `http://localhost:3000/radar-lab` et clique sur `Rendre la dernière trame`.

Si Python n'est pas dans le `PATH`, pointe Next.js vers un exécutable explicite avant de lancer le serveur :

```powershell
$env:PYTHON_BIN="C:\chemin\vers\python.exe"
npm run dev
```

## Historique radar OPERA local

Le Radar Lab peut preparer les 12 derniers scans reels OPERA DBZH en cache local. Le cache reste sur la machine de developpement parce que les fichiers ODIM HDF5 sont lourds, le rendu Python est couteux et cette etape sert uniquement a valider les trames avant une animation produit.

Le telechargement HDF5, la lecture avec `h5py` et la conversion WebP sont strictement cote serveur. Le navigateur ne recoit jamais la cle `METEOGATE_API_KEY`, ni URL MeteoGate, ni lien HDF5 brut : il ne lit que les routes internes Weyra qui servent les WebP deja presents dans le cache.

Pour preparer l'historique, lance le serveur local avec `METEOGATE_API_KEY` dans `.env.local`, ouvre `http://localhost:3000/radar-lab`, puis clique sur `Preparer les 12 derniers scans`. La page affiche un filmstrip statique des frames pretes, les heures UTC/Europe Paris, la projection et l'etat du georeferencement.

Cette etape n'inclut pas encore l'animation automatique dans Radar Lab ou Atlas. Elle valide seulement que les scans sont reels, ordonnes, rendus en WebP et reutilisables.

Ne commit jamais `.env.local` et ne copie jamais la cle MeteoGate dans le code, les logs, le README ou une URL front-end.

## Variables d'environnement

Copie `.env.example` en `.env.local`.

```env
METEOFRANCE_APPLICATION_ID=
METEOGATE_API_KEY=
WEYRA_RADAR_CACHE_DIR=
```

- `METEOFRANCE_APPLICATION_ID` reste cote serveur et permet de renouveler automatiquement le
  jeton OAuth du Package Radar officiel.
- Météo-France est prioritaire pour la mosaique DBZH France metropolitaine a 1 km / 5 minutes.
- MeteoGate fournit OPERA pour la couverture europeenne et le repli amont.
- Les observations restent en mode local tant que la plateforme PostgreSQL auto-hebergee de
  l'ADR-0001 n'est pas implementee.

## Avant une ouverture publique

- Comptes, sessions revocables et autorisation par proprietaire dans PostgreSQL.
- Modération images/texte, anti-spam, limite d’envoi, signalement.
- Géolocalisation arrondie par défaut et politique de rétention.
- Respect des licences et attributions Météo-France / EUMETNET pour chaque produit.
- Backend cache/CDN pour ne jamais exposer de clé fournisseur au navigateur.

## Fichiers importants

- `components/atlas/AtlasMap.tsx` — moteur de carte, clusters, pastilles photo, rendu radar.
- `components/atlas/AtlasApp.tsx` — données live, timeline, UI Atlas et adapter radar.
- `components/atlas/ObservationDrawer.tsx` — création d'une observation.
- `components/atlas/ObservationDetail.tsx` — popup social.
- `app/globals.css` — système visuel Atlas.
- `ATLAS-S3.md` — règles de design et critères de validation.
- `docs/architecture/ADR-0001-self-hosted-data-platform.md` — cible donnees et authentification.
