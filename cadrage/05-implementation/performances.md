# Performances

## Budgets (mesurables, testés)

| Métrique | Budget | Condition |
|---|---|---|
| Pan/zoom canvas | 60 fps (pas de frame > 32 ms) | projet de référence : 40 pages, 120 sections, 300 comportements, 20 services |
| Frappe dans le panneau de propriétés | < 16 ms par frappe | aucune répercussion sur le canvas pendant la saisie |
| Drag d'une frame | 60 fps | recalcul d'ordre inclus |
| Ouverture d'un projet 5 Mo | < 1 s | parse + validation + montage canvas |
| Bascule de mode (canvas → specs) | < 200 ms | projet de référence |
| Autosave | imperceptible | jamais dans le chemin d'une interaction |

Un fichier `fixtures/reference-project.flooow.json` (généré par script, tailles ci-dessus) sert aux tests de perf et au smoke Playwright.

## Les trois pièges connus, et leur parade

### 1. Réactivité profonde sur le graphe
Le piège Vue classique : mettre 500 nœuds en `reactive` profond → chaque frappe déclenche des traversées de dépendances énormes.
- Le store garde les nœuds dans un `shallowRef<Map<string, FlooowNode>>` ; une mutation remplace **l'objet nœud** (immutable style) et bump la Map — pas de réactivité intra-objet.
- Les getters dérivés dépendent d'un compteur de version (`graphVersion++` à chaque mutation) plutôt que du contenu profond.
- Conséquence assumée : les composants nœud reçoivent leur donnée par prop et se re-rendent quand leur objet change de référence — c'est exactement le modèle de Vue Flow.

### 2. Store ↔ Vue Flow : mapping, pas partage
- Ne jamais donner les objets du store à Vue Flow par référence. `useCanvasSync.ts` **mappe** `FlooowNode → Node` (Vue Flow) et écoute les events (`onNodeDragStop`, `onConnect`, `onNodesChange`) pour retraduire en actions du store.
- Pendant un **drag**, Vue Flow gère la position seul (état interne) ; le store n'est mis à jour qu'au **drop** (une seule mutation, un seul patch d'undo, un seul autosave). Idem redimensionnement.
- Le badge d'ordre « #n » affiché pendant le drag lit la position live de Vue Flow, pas le store.

### 3. La saisie ne traverse pas le graphe
- Le PropertiesPanel édite un **buffer local** (copie des attrs du nœud sélectionné) ; commit vers le store au blur / à la validation, avec debounce 300 ms sur les champs texte.
- Résultat : taper dans « notes » ne re-rend ni le canvas ni les vues.

## Vues dérivées : lazy et bon marché

- `deriveSpecs` / `deriveApi` sont O(n) et ne tournent que si le mode correspondant est affiché (`computed` évalué à la demande + invalidation par `graphVersion`).
- `spatialOrder` est O(n log n) sur des dizaines d'éléments : recalcul à chaque affichage, pas de cache.
- SpecsView : si > 100 pages, virtualiser la liste (`vue-virtual-scroller`) — hors projet de référence, à ne faire que si mesuré nécessaire.

## Persistance hors du chemin critique

- Autosave : debounce 2 s après la dernière mutation, sérialisation via `structuredClone` puis `JSON.stringify` ; IndexedDB est asynchrone par nature. Si la sérialisation du projet de référence dépasse ~15 ms (à mesurer), la déplacer dans un Web Worker — ne pas le faire préventivement.
- Jamais d'autosave pendant un drag (le store ne mute qu'au drop, donc garanti par construction).

## Divers

- Icônes : sprite SVG local unique (pas de lib d'icônes composant-par-icône qui gonfle le bundle).
- Bundle cible : < 400 Ko gzippé (Vue Flow est la plus grosse part). `rollup-plugin-visualizer` en CI pour surveiller.
- `will-change: transform` sur le viewport du canvas uniquement ; pas de `backdrop-blur` sur des surfaces qui bougent à 60 fps (les panneaux flottants sont fixes → OK).
- Mesure continue : marqueurs `performance.mark/measure` autour de load/parse/derive/export, visibles en dev via un mini-overlay debug (`?perf=1`).
