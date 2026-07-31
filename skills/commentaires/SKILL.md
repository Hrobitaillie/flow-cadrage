---
name: commentaires
description: Relève et traite les commentaires « ✳ pour Claude » d'un projet Flooow (consignes déposées dans l'app par l'utilisateur), puis répond et résout chaque fil. Usage : /flooow:commentaires <dossier/fichier> — ou coller une référence flooow://…#… pour traiter UN fil précis.
---

# Traiter les commentaires « pour Claude »

CLI (seul canal du graphe), invocable depuis n'importe où :

```bash
pnpm -s -C ${CLAUDE_PLUGIN_ROOT} flooow --help
```

## Déroulé

1. **Relève.**
   - Projet entier : `flooow comments <dossier/fichier> --for-claude` (fils OUVERTS adressés
     à l'agent — ce sont des consignes à traiter, pas des remarques décoratives).
   - Référence collée (`flooow://…#…`) : `flooow comment <référence>` → le fil, la fiche de
     l'élément ancré et le mode d'emploi exact.
2. **Traitement, fil par fil.** Charger le MINIMUM de contexte : la fiche de l'élément ancré
   (`flooow get <projet> <poignée> --content`), et seulement de proche en proche si besoin.
   Une consigne lourde (rédaction longue, exploration de code) se délègue à un sous-agent
   **sonnet** qui reçoit la fiche + la consigne et renvoie le markdown ou les ops à poser.
3. **Appliquer** les changements demandés via `flooow apply` (vocabulaire : `flooow ops`) —
   `set-content`, `update`, créations/liens selon la consigne.
4. **Répondre ET résoudre dans le MÊME lot** — un fil traité sans réponse ni résolution est
   un travail invisible :

   ```bash
   echo '{"ops":[
     {"op":"reply-comment","comment":"<id>","markdown":"Fait : … (ce qui a été changé, en 1-3 phrases)"},
     {"op":"resolve-comment","comment":"<id>"}
   ]}' | pnpm -s -C ${CLAUDE_PLUGIN_ROOT} flooow apply <dossier/fichier>
   ```

   Si la consigne est ambiguë ou dépasse le périmètre : répondre dans le fil en posant la
   question, NE PAS résoudre, et le signaler à l'utilisateur.
5. **Vérifier** : `flooow comments <dossier/fichier> --for-claude` doit rendre « Aucun
   commentaire ne correspond » (hors fils laissés ouverts volontairement). Rendre à
   l'utilisateur un récapitulatif court : fils traités → ce qui a changé.
