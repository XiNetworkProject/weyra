# Weyra Horizon — interface immersive

L’accueil photographique, le voyage plein écran, Atlas, Explorer, les communautés et le carnet reprennent la nouvelle direction visuelle validée. Le plein écran utilise un mode dédié de DialogContent : aucune translation de centrage à −50 % ne s’applique à « Se laisser porter ».

## Lancer le test local

Les commandes habituelles restent valables :

```sh
pnpm install
pnpm dev
```

Conserver la configuration météo locale existante. Aucune clé fournisseur n’est incluse dans le navigateur ou dans ce changement. Le serveur Next.js et les workers Python restent ceux du dépôt.

## Connexions conservées

| Fonction                                 | Connexion                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Conditions et prévisions                 | Open-Meteo, avec relais Next.js `/api/weather`                                                     |
| Recherche de villes                      | Géocodage Open-Meteo, avec relais `/api/search`                                                    |
| Historique Météo-France / EUMETNET OPERA | `/api/radar/opera/packs` : uniquement les scans prêts, triés et limités aux 12 derniers            |
| Images radar                             | Routes existantes `packs/[timestamp]/overview/{z}/{x}/{y}`                                         |
| Détail au zoom                           | Préparation du seul viewport via `/api/radar/opera/tiles/prewarm`, puis tuiles `detail` existantes |
| Ingestion locale                         | Déclenchement de maintenance en développement ; worker permanent existant en production            |
| Diagnostic                               | Pages et routes de santé radar existantes                                                          |

Le détail ne s’exécute pas pendant la lecture radar. La couche de base reste affichée tant que le détail n’est pas entièrement prêt. Les limites géographiques, les niveaux de zoom, le style, l’attribution et les dates proviennent des packs. Une actualisation conserve le scan consulté ; le dernier scan n’est suivi automatiquement que si l’utilisateur était déjà en fin de timeline. Le fond OpenFreeMap/MapLibre bascule sur OpenStreetMap/Leaflet si WebGL n’est pas disponible.

Les routes d’observations, de modération et d’authentification existantes restent présentes. L’interface Horizon de cette branche fonctionne toutefois en **test local** : ses observations, photos réencodées, favoris, profils, communautés, messages et événements sont enregistrés dans IndexedDB (`weyra-horizon-local-v1`). Ils ne sont pas envoyés aux anciennes routes sociales et ne sont pas partagés entre navigateurs. Les anciennes données locales ne sont ni effacées ni importées automatiquement. La messagerie entre membres, les Storm Rooms synchronisées et les notifications push restent à connecter.

Les photos et communautés d’exemple sont identifiées comme démonstrations. Elles ne représentent pas la météo actuelle. Les crédits des photographies sont dans `public/images/credits.json`.

## Validation

- Compilation Next.js et vérification TypeScript réussies.
- Tests unitaires : contrats radar existants, conversion des packs, fenêtre glissante, sélection du scan, préparation du détail, sauvegarde/relecture/suppression IndexedDB et absence de publication réseau implicite.
- Plein écran vérifié dans la démonstration : coordonnées `(0, 0)` et dimensions égales au viewport après clic sur « Se laisser porter ».
- La version Next.js n’a pas pu être ouverte via le navigateur distant de cet environnement. Les clés Météo-France/OPERA ne sont pas disponibles ici ; les scans en direct restent à vérifier avec la configuration locale habituelle.

L’ancienne feuille de style est isolée dans `app/legacy.css` pour les pages secondaires existantes. Les anciens composants restent dans Git mais ne composent plus la page d’accueil. La version des caches PWA est incrémentée pour éviter de conserver l’ancien shell hors ligne.
