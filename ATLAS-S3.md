# Weyra Atlas S3 — Map Core

## Objectif de cette passe

La référence Atlas est une carte immersive Nord / Belgique / Hauts-de-France : la carte doit rester dominante, la météo et les couches flottent au-dessus, et la communauté n'encombre jamais la lecture du radar.

## Changements inclus

### Caméra et fond cartographique

- Cadrage initial verrouillé sur `Lille / Dunkerque / Calais / Tournai / Arras` (`zoom 8.35`).
- Vue strictement top-down : pas d'inclinaison ni de rotation qui donne l'impression que les points glissent.
- Retouche native du style vectoriel CARTO : eau bleu nuit, routes bleutées, frontières plus lisibles et disparition des grands labels de région génériques.

### Observations

- Source GeoJSON MapLibre avec **clusters natifs** à la vue France / Europe.
- Au zoom régional, les événements sans photo deviennent de petits points colorés à la bonne coordonnée.
- Les pastilles photo sont réservées aux **vraies images téléversées par les membres**.
- Elles n'apparaissent qu'à partir du zoom local et ne sont plus empilées : une règle de collision masque les marqueurs trop proches.
- Clic sur cluster : rapproche la caméra ; clic sur point : ouvre la fiche observation.

### Radar

- Deux couches raster restent en mémoire et se fondent en douceur, sans suppression/recréation de la couche visible.
- Opacité et contraste réduits pour laisser respirer le fond vectoriel.
- La timeline affiche le **scan réel** sélectionné.
- Le badge LIVE n'est actif que si le dernier scan est récent (`≤ 7 min`).
- Atlas vérifie la timeline chaque minute, mais n'invente pas de nouveau scan entre les trames fournies par la source.

### Préparation au radar France 5 minutes

- `NEXT_PUBLIC_RADAR_TIMELINE_URL` permet de brancher un backend Weyra qui renvoie une timeline normalisée, par exemple depuis un flux radar Météo-France autorisé.
- Sans cet adapter, RainViewer reste un fallback de prototype. Son endpoint public ne garantit pas le pas de 5 minutes nécessaire à Atlas France.

## Critères de test

1. Chargement : la caméra doit tomber directement sur le Nord, pas l'Europe entière.
2. Dézoom : les points communauté doivent devenir des clusters, jamais une colonne de gros avatars.
3. Zoom régional : les petits points doivent rester collés à leur ville en pan/zoom.
4. Ajout d'une vraie photo : la pastille photo doit apparaître seulement à un zoom local et sans chevaucher les autres.
5. Radar : faire jouer la timeline ne doit pas créer de flash ; la carte doit rester visible sous le radar.
