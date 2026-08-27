# Legacy Supabase staging (deprecated)

> Ce document est conserve uniquement pour expliquer l'ancien adaptateur. Supabase n'est plus une
> cible de deploiement Weyra. Ne creez pas de nouveau projet et n'ajoutez pas ces variables en
> production. La direction retenue est decrite dans
> `docs/architecture/ADR-0001-self-hosted-data-platform.md`.

Ce runbook permet de valider Weyra sur un projet Supabase dedie au staging. Il ne doit jamais viser
une base contenant des donnees reelles.

## Preconditions

- Un projet nomme explicitement pour Weyra staging.
- Les migrations du dossier `supabase/migrations` relues et versionnees.
- Une cle publiable pour les clients et une cle secrete reservee au serveur.
- Une sauvegarde ou une branche Supabase avant toute evolution d'un projet deja utilise.

Ne jamais reutiliser un projet appartenant a une autre application simplement parce qu'il est actif.

## Liaison et migrations

```powershell
pnpm exec supabase link --project-ref <weyra-staging-project-ref>
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase db lint --linked --level warning --fail-on error
```

La premiere commande ecrit uniquement la reference du projet dans `supabase/.temp`, un dossier ignore
par Git. Aucun mot de passe ni aucune cle ne doit etre ajoute au depot.

## Configuration locale de verification

Dans `.env.local`, renseigner sans les afficher dans les logs :

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
WEYRA_SUPABASE_ENVIRONMENT=staging
WEYRA_SUPABASE_STAGING_CONFIRM=I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED
```

La cle secrete est utilisee uniquement par le script de verification et par les routes serveur. Elle
ne doit jamais porter le prefixe `NEXT_PUBLIC_`.

## Verification automatisee

```powershell
pnpm run supabase:verify:staging
```

Le script cree deux comptes ephemeres puis verifie :

1. Authentification independante des deux comptes.
2. Upload Storage reserve au proprietaire.
3. Arrondi des coordonnees d'observation cote Postgres.
4. Observation en attente invisible pour l'autre compte.
5. Reception Realtime par l'auteur autorise.
6. Publication et media approuve accessibles au second compte.
7. Signalement et ouverture automatique d'un dossier de moderation.
8. Retrait d'une observation et revocation immediate de l'acces au media.
9. Nettoyage des lignes, objets et comptes crees par le test.

Le script refuse de demarrer sans les deux variables de garde staging. Ses sorties sont structurees et
n'incluent aucune cle, aucun jeton ni mot de passe.

## Controle final

Apres les migrations, lancer les advisors de securite et de performance dans Supabase. Toute table du
schema expose doit avoir RLS active, des privileges minimaux et des index sur les colonnes utilisees
dans les policies. Un resultat de test reussi ne remplace pas cette revue.
