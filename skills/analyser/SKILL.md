---
name: analyser
description: Génère (ou complète) le cadrage Flooow d'un projet depuis son codebase — graphe de pages/blocs, modules/fonctionnalités, services/API, fiches markdown. Usage : /flooow:analyser <dossier/fichier> <source du codebase (chemin local ou hôte ssh + chemin)>. À utiliser quand l'utilisateur veut documenter/cadrer un projet existant dans Flooow.
---

# Analyser un codebase → cadrage Flooow

La CLI (seul canal de lecture/écriture du graphe) s'invoque ainsi, depuis n'importe où :

```bash
pnpm -s -C ${CLAUDE_PLUGIN_ROOT} flooow --help
```

Deux arguments attendus : `<dossier/fichier>` (le projet Flooow) et la **source** du codebase
(chemin local, ou `ssh <hôte>` + chemin distant — dans ce cas toute lecture passe par des
commandes ssh en LECTURE SEULE : ls, cat, grep, head ; jamais d'écriture côté serveur).

## Règles d'économie de contexte (non négociables)

- Le modèle principal ne lit JAMAIS le codebase en entier : il ne voit que des inventaires
  compacts renvoyés par des sous-agents.
- Chaque sous-agent (modèle **sonnet**) reçoit UN périmètre (un module, un dossier, un
  ensemble de routes) et renvoie un inventaire structuré COURT (listes, pas de code).
- Toute écriture passe par `flooow apply` en petits lots atomiques ; `flooow summary` entre
  les lots pour vérifier, jamais de relecture intégrale.

## Déroulé

1. **Projet.** `flooow ls` — si `<dossier/fichier>` n'existe pas :
   `flooow create <dossier/fichier> "<Nom>" [--repo <dépôt hôte local>]` (--repo si le
   cadrage doit être versionné avec un dépôt local).
2. **Reconnaissance** (modèle principal, léger) : arborescence de premier niveau du
   codebase (frameworks, points d'entrée, dossiers métier). En tirer un découpage en
   3–10 périmètres d'exploration.
3. **Fan-out** : un sous-agent sonnet par périmètre (en parallèle), consigne type :
   « Explore <périmètre> (lecture seule). Renvoie UNIQUEMENT : pages/écrans (nom, route,
   rôle), fonctionnalités métier (nom, quoi, dépendances), services/APIs externes ou
   internes (nom, base URL, endpoints méthode+chemin), points d'attention. Format liste
   compacte, pas de code, max ~60 lignes. »
4. **Arbitrage** (modèle principal) : fusionner les inventaires en un découpage cohérent —
   modules (3–8), fonctionnalités codées (ex. CMD-01), pages et blocs principaux, services.
   En cas de doute sur un périmètre, re-déléguer une vérification ciblée, ne pas lire soi-même.
5. **Écriture** par lots `flooow apply` (vocabulaire : `flooow ops`) :
   d'abord `set-site` + modules + services, puis pages/blocs — les pages AVEC leur
   hiérarchie (`"parent"` : la hiérarchie de pages EST la hiérarchie d'URL, le slug est un
   SEGMENT — page d'accueil = racine slug vide, `/offres/:uuid` = page `:uuid` sous
   `offres`) —, puis fonctionnalités avec
   `content` (fiche markdown COURTE : quoi / comment c'est fait aujourd'hui / points
   d'attention) ET leur `status` réel (`en-production` pour l'existant, `a-developper`/
   `cadree` pour les manques constatés, `reportee` pour le documenté-mais-pas-fait),
   puis liens `realizedBy` et `dependsOn` (le VRAI graphe de dépendances — une
   fonctionnalité par ce qu'elle présuppose techniquement), `add-api-ref` sur les blocs.
6. **Vérification** : `flooow summary` — traiter les « points d'attention » (fonctionnalités
   non réalisées, pages sans fonctionnalité, orphelins). Rendre à l'utilisateur le lien
   direct vers l'app affiché par `create`/la config.

## Fiches (set-content)

Une fiche par fonctionnalité, ≤ 25 lignes markdown : **Quoi** (2-3 phrases), **État actuel**
(fichiers/routes clés en références courtes), **À confirmer** (questions ouvertes). Le détail
reste dans le code — la fiche sert de carte, pas de copie.
