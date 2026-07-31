# Flooow

> 📖 **Guide d'utilisation complet : [docs/UTILISATION.md](docs/UTILISATION.md)**
> (installation, workflow humain/agent, CLI, skills, dépannage, aide-mémoire)

Outil de cadrage visuel **agentique** pour projets web de solutions métier : un canvas de
frames imbriquées (site → pages → blocs) et de nœuds typés (fonctionnalités, services/API,
commentaires), d'où sont dérivées automatiquement les vues « Spécifications », « API » et
« Catalogue de fonctionnalités ».

> **Insight central** : le canvas n'est pas le produit — le produit est un graphe unique,
> dont canvas, specs et API ne sont que des projections.

Le mode d'usage visé est **piloté par agent** : Claude rédige et structure le cadrage
(graphe + fiches) via la CLI `flooow` ; l'humain lit dans l'app, dépose des commentaires
« ✳ pour Claude » (ancrés sur une page, un bloc, un passage), et Claude les relève, les
traite, y répond et les résout. L'humain ne rédige rien à la main.

## Ce dépôt (le « kit »)

```
app/              front Vue 3 + Vue Flow + Tiptap (canvas, vues dérivées, commentaires)
packages/core/    cœur métier partagé (modèle v13, zod, migrations, dérivations, ops agent)
server/           mini-serveur : REST + rooms Yjs (écrivain unique) + statique app buildée + CLI
cadrage/          le cadrage du projet Flooow lui-même (démarche méta)
data/             projets locaux <dossier>/<fichier>.graph.json (ignoré par git, symlinks ok)
```

Le kit s'installe **une fois** (clone) et sert **plusieurs projets** : le hub de l'app liste
tous les projets de `data/`, et chaque projet peut être rangé dans le dépôt qu'il cadre
(`flooow create … --repo <chemin>` → graphe versionné avec le dépôt hôte, voir plus bas).

## Installation

```bash
git clone <ce dépôt> flooow && cd flooow
pnpm install            # workspace : server + packages/*
npm --prefix app ci     # l'app est gérée par npm (lockfile figé)
npm run build           # build de l'app (servie ensuite par le serveur)
```

### Mise à jour

```bash
git pull && pnpm install && npm --prefix app ci && npm run build
```

Les `.graph.json` existants sont migrés automatiquement à l'ouverture (registre de
migrations du core) — les données des projets ne bougent pas.

## Usage solo (local)

```bash
pnpm start              # serveur unique : app + API + temps réel → http://localhost:3010
```

- `FLOOOW_USER=Hugo pnpm start` personnalise l'auteur des commentaires/présence.
- `PORT`, `DATA_DIR`, `APP_DIST` : voir `server/src/config.ts`.
- Sans `app/dist` (dev), le serveur reste API-seulement et l'app tourne via `pnpm dev` (Vite).

**Règle d'or : personne n'écrit un `.graph.json` à la main.** L'app écrit via la room Yjs ;
un agent écrit via `flooow apply` (lot d'ops atomique, validé zod + invariants), appliqué à
travers la même room → les changements apparaissent en direct dans le navigateur.

## CLI agent

```bash
pnpm -s flooow ls                                  # projets disponibles
pnpm -s flooow summary <dossier/fichier>           # sommaire compact (point d'entrée, toujours)
pnpm -s flooow get <dossier/fichier> <poignée> [--content]
pnpm -s flooow comments <dossier/fichier> --for-claude   # consignes à traiter
pnpm -s flooow comment <flooow://…#…>              # un fil + sa fiche + le mode d'emploi
pnpm -s flooow apply <dossier/fichier> ops.json    # SEUL chemin d'écriture (flooow ops = vocabulaire)
pnpm -s flooow create <dossier/fichier> [nom] [--repo <chemin> | --site <env>/<slug>]
```

Méthode (économie de contexte) : `summary` d'abord, puis `get` de proche en proche ;
`--content` seulement sur l'élément travaillé. Jamais tout lire.

### Ranger un projet dans le dépôt qu'il cadre

```bash
pnpm -s flooow create tacotaf/app "App Tacotaf" --repo ~/Documents/GitHub/tacotaf-cadrage
```

pose dans le dépôt hôte : `docs/.graph/` (le graphe, versionné avec le dépôt),
le narratif typé (`docs/decisions|questions|decouvertes|spec/`) et `docs/AGENTS.md`
(mode d'emploi auto-porteur pour tout agent travaillant dans ce dépôt). Côté kit,
`data/<dossier>` devient un lien symbolique — le hub et la CLI voient le projet normalement.

## Plugin Claude Code

Le dépôt est aussi un plugin Claude Code (skills `/flooow:analyser`, `/flooow:commentaires`,
`/flooow:etape`). L'installer depuis le **clone local** (pas depuis GitHub : les skills
invoquent la CLI du kit via `${CLAUDE_PLUGIN_ROOT}`, qui doit pointer sur un kit installé
et buildé) :

```
/plugin marketplace add ~/Documents/GitHub/flooow
/plugin install flooow@flooow
```

- `/flooow:analyser <dossier/fichier> <codebase>` — génère le cadrage depuis un codebase
  (local ou ssh, lecture seule) : fan-out de sous-agents sonnet par périmètre, écriture par
  lots d'ops, fiches courtes.
- `/flooow:commentaires <dossier/fichier>` — relève les fils « ✳ pour Claude », traite,
  répond et résout dans le même lot.
- `/flooow:etape <dossier/fichier> [poignée]` — développe la prochaine fonctionnalité non
  réalisée (lots + dépendances), puis remet le graphe à jour.

## Dev

```bash
pnpm dev                # Vite (app) + serveur Node en parallèle, proxy /api et /collab
npm --prefix app test   # 492 tests (vitest) — inclut le core
pnpm -C server typecheck && pnpm -C packages/core typecheck
```

Voir `CLAUDE.md` pour les conventions (format de projet, migrations, couleurs) et
`cadrage/06-pivot-agentique/` pour le plan du pivot agentique.

## Multi-utilisateur (optionnel, non requis en solo)

Le serveur lit les headers d'identité AuthCrunch s'ils sont présents (déploiement derrière
un Caddy authentifiant : rôle `client` = lecture seule) et `--site <env>/<slug>` range un
projet dans l'infra bao/Portulan. En local, sans headers : identité anonyme (ou
`FLOOOW_USER`), tous droits.
