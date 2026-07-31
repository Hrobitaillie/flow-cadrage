---
name: etape
description: Développe la prochaine fonctionnalité d'un projet cadré dans Flooow, étape par étape — choisit la fonctionnalité (ou prend la poignée donnée), charge sa fiche, implémente dans le dépôt du projet, puis met à jour le graphe. Usage : /flooow:etape <dossier/fichier> [poignée ou code, ex. CMD-01].
---

# Développer la prochaine fonctionnalité

CLI (seul canal du graphe), invocable depuis n'importe où :

```bash
pnpm -s -C ${CLAUDE_PLUGIN_ROOT} flooow --help
```

## Déroulé

1. **Choisir l'étape.** `flooow summary <dossier/fichier>` (jamais plus). Si une poignée/un
   code est fourni, c'est l'étape. Sinon choisir la prochaine fonctionnalité NON réalisée :
   lot le plus bas d'abord, dépendances (`dependsOn`) satisfaites avant tout, et annoncer le
   choix à l'utilisateur en une phrase.
2. **Charger le contexte minimal.** `flooow get <projet> <poignée> --content` (la fiche),
   puis les fiches des éléments liés (pages `realizedBy`, services référencés) — de proche
   en proche, `--content` seulement sur ce qui est travaillé.
3. **Vérifier les préalables.** Fiche floue, « À confirmer » non tranché, dépendance non
   réalisée → poser la question (créer un commentaire via `create-comment` si l'utilisateur
   est absent) plutôt que de deviner.
4. **Implémenter** dans le dépôt du projet (celui que le cadrage décrit — si le projet a été
   rangé par `--repo`, le graphe vit dans son `docs/.graph/`). Travail de code normal :
   petits pas, tests/build du projet s'ils existent. Les gros volumes de lecture/rédaction
   se délèguent à des sous-agents **sonnet** ; le modèle principal garde l'arbitrage.
5. **Mettre à jour le graphe** via `flooow apply`, même mouvement que le code :
   - fiche de la fonctionnalité : `set-content` (état passé de « à faire » à « comment c'est
     fait », références courtes vers les fichiers clés) ;
   - `update` des champs (lot, estimation devenue réelle…), liens `realizedBy` vers les
     pages/blocs concernés, `add-api-ref` si des endpoints sont apparus ;
   - toute décision prise en route : fichier dans `docs/decisions/` du dépôt hôte (narratif),
     pas dans le graphe.
6. **Rendre compte** : ce qui a été implémenté, ce qui a changé dans le graphe, et la
   prochaine étape naturelle (sans la lancer).
