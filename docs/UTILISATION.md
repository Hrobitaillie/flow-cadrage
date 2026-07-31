# Flooow — guide d'utilisation complet

Flooow est un outil de **cadrage agentique** : le produit est un graphe unique par projet
(pages, blocs, modules, fonctionnalités, services, commentaires), dont le canvas et les vues
Specs / API / Catalogue ne sont que des projections.

Le partage des rôles :

- **Claude (agents)** rédige et structure tout — via la CLI `flooow`, jamais à la main.
- **L'humain** lit dans l'app, réarrange le canvas, et pilote par **commentaires
  « ✳ pour Claude »** ancrés sur les éléments.
- **Le serveur** est l'unique écrivain du fichier : app et agents passent par lui, les
  changements apparaissent en direct dans le navigateur.

```
┌─────────┐  commentaires ✳   ┌────────────┐   ops (apply)   ┌────────┐
│  Hugo    │ ────────────────▶ │   graphe    │ ◀────────────── │ Claude │
│ (l'app)  │ ◀──────────────── │ .graph.json │ ──────────────▶ │ (CLI)  │
└─────────┘   rendu live      └────────────┘  summary/get     └────────┘
```

---

## 1. Installation

### Nouvelle machine

```bash
git clone https://github.com/Hrobitaillie/flow-cadrage.git flooow && cd flooow
npm i -g pnpm@10.34.5      # ⚠ ÉPINGLER pnpm 10 — voir Dépannage « pnpm 11 »
pnpm install               # workspace : server + packages/core
npm --prefix app ci        # l'app est gérée par npm (lockfile figé)
npm run build              # build de l'app (servie ensuite par le serveur)
```

### Mise à jour

```bash
cd <kit> && git pull && pnpm install && npm --prefix app ci && npm run build
# puis relancer le serveur
```

Les `.graph.json` existants sont migrés automatiquement à l'ouverture (registre de
migrations du core) — les données des projets ne bougent jamais à la mise à jour.

### Installations existantes

| Où | Chemin | Rôle |
|----|--------|------|
| Mac | `~/Documents/GitHub/flooow` | dev du kit + usage local |
| Chappie | `/opt/flooow` | héberge le cadrage tacotaf |

---

## 2. Lancer le serveur

```bash
cd <kit>
FLOOOW_USER=Hugo pnpm start        # → http://localhost:3010
```

- Un seul process : app buildée + API REST + temps réel (`/collab`).
- `FLOOOW_USER` = ton nom sur les commentaires et la présence. Sans lui : « Anonyme ».
- Variables : `PORT` (3010), `DATA_DIR` (`<kit>/data`), `APP_DIST`, `HOST`.

**Sur un serveur distant (ex. Chappie)** — le serveur solo n'a AUCUNE authentification :
toujours `HOST=127.0.0.1`, jamais de port exposé, accès par tunnel SSH :

```bash
# sur le serveur
cd /opt/flooow && HOST=127.0.0.1 FLOOOW_USER=Hugo nohup pnpm start > /var/log/flooow.log 2>&1 &
# depuis le Mac
ssh -L 3010:127.0.0.1:3010 Chappie     # → http://localhost:3010
```

(⚠ ce lancement ne survit pas à un reboot — pour pérenniser, unité systemd, cf. §8)

---

## 3. Créer un projet de cadrage

Le kit est **multi-projets** : le hub (`/`) liste tout ce que contient `data/`.

```bash
pnpm -s flooow create <dossier>/<fichier> "Nom du projet"                 # simple
pnpm -s flooow create <dossier>/<fichier> "Nom" --repo <chemin du dépôt>  # recommandé
```

Avec `--repo`, le cadrage est **rangé dans le dépôt qu'il décrit** :

```
<dépôt>/docs/
  .graph/<fichier>.graph.json   le graphe — versionné avec le dépôt hôte
  AGENTS.md                     mode d'emploi auto-porteur pour tout agent du dépôt
  decisions/  questions/  decouvertes/  spec/    narratif markdown (édition directe)
```

et `data/<dossier>` dans le kit devient un lien symbolique. Référencer `docs/AGENTS.md`
depuis le `CLAUDE.md` du dépôt hôte pour que les agents le découvrent.

**Règle d'or : personne n'édite un `.graph.json` à la main.** Un projet ouvert dans l'app
serait réécrit par le serveur ; le seul chemin d'écriture agent est `flooow apply`.

---

## 4. Côté humain — l'app

- **Hub** `/` : tous les projets. **Éditeur** `/p/<dossier>/<fichier>` : canvas + vues.
- **Canvas** : pages (piles de blocs), notes, liens typés (`navigatesTo`, `dependsOn`,
  `realizedBy`), couche structurelle / fonctionnelle. Tout est réarrangeable — les
  positions t'appartiennent, Claude n'écrit que le contenu.
- **Vues dérivées** (boutons de mode) : Specs (cahier ordonné), API (par service),
  Catalogue (fonctionnalités par module).
- **Commentaires** : panneau 💬 — ouvrir un fil sur une page, un bloc, un passage.
  Cocher **« ✳ pour Claude »** pour en faire une consigne agent. Le bouton **🔗** d'un fil
  copie une référence `flooow://…#…` à coller telle quelle à Claude.
- Le travail de Claude apparaît **en direct** (rooms Yjs) : garde l'app ouverte pendant
  qu'il travaille.

### La boucle de pilotage type

1. Tu lis le cadrage dans l'app, tu déposes des ✳ (« détaille ce module », « c'est faux,
   le paiement passe par X », « découpe cette fonctionnalité en 2 lots »).
2. Tu lances `/flooow:commentaires <dossier>/<fichier>` dans une session Claude (ou tu
   colles une référence 🔗).
3. Claude traite chaque fil au contexte minimal, modifie le graphe, **répond et résout**.
4. Tu relis en live, tu recommences.

---

## 5. Côté Claude — la CLI

Invocable depuis n'importe où : `pnpm -s -C <kit> flooow <commande>`.

### Lecture (3 niveaux de zoom, jamais plus que nécessaire)

```bash
flooow ls                                # projets
flooow summary <d/f>                     # sommaire : 1 ligne par entité + poignées + points d'attention
flooow get <d/f> <poignée>               # fiche d'UN élément + interconnexions
flooow get <d/f> <poignée> --content     # + son contenu markdown
flooow find <d/f> <texte>                # recherche (nom/code/route, insensible aux accents)
```

Poignée = id court affiché (préfixe ≥ 4), id complet, ou code (`PAY-01`).

### Commentaires

```bash
flooow comments <d/f> --for-claude       # les consignes ouvertes — À RELEVER en début de session
flooow comment <flooow://d/f#id>         # UN fil + la fiche de l'élément ancré + mode d'emploi
```

### Écriture — uniquement par ops

```bash
flooow ops                               # mémo du vocabulaire, avec exemples
flooow apply <d/f> ops.json              # lot ATOMIQUE (ou JSON sur stdin) — tout ou rien
```

Vocabulaire (extraits) : `create-module`, `create-feature` (code, lot, content markdown),
`create-page`, `create-block`, `create-service`, `add-api-ref`, `set-content`, `update`,
`link`/`unlink` (`navigatesTo` · `dependsOn` · `realizedBy`), `set-site`, `set-home`,
`delete`, et côté fils : `create-comment` (flag `forClaude`), `reply-comment`,
`resolve-comment`.

**Règles pour les agents** (écrites aussi dans les skills) :

- `summary` d'abord, puis `get` de proche en proche ; `--content` seulement sur l'élément
  travaillé. **Jamais tout lire.**
- Écrire par **petits lots cohérents** et relire la fiche après coup.
- Un fil traité = **réponse + résolution dans le même lot** — sinon travail invisible.
  Consigne ambiguë → répondre en posant la question, NE PAS résoudre.
- Les ids explicites d'un lot (`"id": "f-pay-01"`) permettent aux ops suivants de s'y
  référer. ⚠ Un id ne doit pas être le **préfixe** d'un autre (`p-offer` vs `p-offers`
  → refus).
- Lecture fichier après écriture room : compter ~5 s de debounce de persistance.

---

## 6. Les skills du plugin

Installation (depuis le **clone local** — les skills invoquent la CLI du kit) :

```
/plugin marketplace add <chemin du kit>
/plugin install flooow@flooow
```

| Skill | Usage |
|-------|-------|
| `/flooow:analyser <d/f> <codebase>` | Génère le cadrage depuis un codebase existant (local ou ssh, lecture seule) : reconnaissance, fan-out de sous-agents Sonnet par périmètre, arbitrage, écriture par lots, fiches courtes. |
| `/flooow:commentaires <d/f>` | Relève les ✳ ouverts, traite fil par fil au contexte minimal, répond + résout. Accepte aussi une référence `flooow://…`. |
| `/flooow:etape <d/f> [poignée]` | Développe la prochaine fonctionnalité non réalisée (lot le plus bas, dépendances satisfaites), implémente dans le dépôt hôte, remet le graphe à jour. |

---

## 7. Le déploiement tacotaf (cas concret)

- Kit : `/opt/flooow` sur Chappie · serveur `127.0.0.1:3010` · identité `Hugo`.
- Graphe : `/var/www/vhosts/tacotaf.com/app.tacotaf.com/docs/.graph/app.graph.json`
  (symlink `data/tacotaf` ; la copie Mac `~/Documents/GitHub/tacotaf-cadrage` est une archive).
- Voir l'app : `ssh -L 3010:127.0.0.1:3010 Chappie` → http://localhost:3010/p/tacotaf/app
- Agents sur le serveur : `pnpm -s -C /opt/flooow flooow comments tacotaf/app --for-claude`
  (mode d'emploi complet : `docs/AGENTS.md` du projet tacotaf).

---

## 8. Dépannage

| Symptôme | Cause / remède |
|----------|----------------|
| `ERR_PNPM_IGNORED_BUILDS` en boucle au `pnpm start` | pnpm 11 installé : il ignore `onlyBuiltDependencies` et écrit un placeholder `allowBuilds` invalide dans `pnpm-workspace.yaml`. → `npm i -g pnpm@10.34.5` puis `git checkout -- pnpm-workspace.yaml` et réinstaller. |
| `git pull` refuse (« local changes … pnpm-workspace.yaml ») | Modif écrite par pnpm 11 (cf. ci-dessus). → `git checkout -- pnpm-workspace.yaml && git pull`. |
| `ssh: command not found: _ssh_extract_host` (Mac) | Wrapper zsh cassé. → utiliser `command ssh` (l'hôte s'appelle `Chappie`, majuscule). |
| L'app ne charge pas sur :3010 | Serveur pas lancé (reboot ?) ou port pris par un autre process/tunnel. → `curl -s http://127.0.0.1:3010/api/health` ; relancer (§2). |
| Un projet n'apparaît pas dans le hub | Symlink `data/<dossier>` cassé (dépôt hôte déplacé) → recréer le lien. |
| Push GitHub refusé (Mac) | Deux comptes : `github.com` = pilotin, alias `github-hrobitaillie` = perso. Le kit pousse via `git@github-hrobitaillie:Hrobitaillie/flow-cadrage.git`. |
| Écriture directe d'un `.graph.json` | Interdit — écrasée par le serveur au prochain store. Passer par `flooow apply`. |

**Pérenniser le serveur (systemd)** — optionnel :

```ini
# /etc/systemd/system/flooow.service
[Unit]
Description=Flooow (cadrage)
[Service]
WorkingDirectory=/opt/flooow
Environment=HOST=127.0.0.1 FLOOOW_USER=Hugo
ExecStart=/usr/local/bin/pnpm start
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

`systemctl daemon-reload && systemctl enable --now flooow`

---

## 9. Aide-mémoire

```bash
# Humain
FLOOOW_USER=Hugo pnpm start                        # lancer (local)
ssh -L 3010:127.0.0.1:3010 Chappie                 # tunnel vers le serveur

# Nouveau projet
pnpm -s flooow create mon-projet/app "Mon App" --repo ~/Documents/GitHub/mon-projet

# Claude
pnpm -s -C <kit> flooow summary <d/f>              # toujours commencer là
pnpm -s -C <kit> flooow comments <d/f> --for-claude
echo '{"ops":[…]}' | pnpm -s -C <kit> flooow apply <d/f>

# Mise à jour du kit
git pull && pnpm install && npm --prefix app ci && npm run build
```
