# L'œil : spécification d'implémentation

Plugin OpenCode Desktop : un onglet du panneau latéral de la session affiche un œil animé qui reflète en continu ce que fait l'agent. Le ton est drôle et expressif : c'est un compagnon, pas un indicateur de chargement.

Ce document s'adresse à l'agent qui implémente le plugin. **Les fichiers de `reference/` font foi** : ils contiennent le dessin, le CSS et le moteur d'animation validés en maquette. Le travail consiste à les porter en composant Solid et à les brancher sur les événements serveur, pas à les redessiner.

| Fichier | Rôle |
|---|---|
| `reference/eye.html` | Markup SVG de l'œil, de la scène sous l'œil et du badge d'outil |
| `reference/eye.css` | Tokens (thèmes clair et sombre), états, accessoires, keyframes, mouvement réduit |
| `reference/eye-engine.js` | Moteur d'animation sans dépendance : boucle rAF, ressorts, regard, clignements. Écrit uniquement des variables CSS |
| `reference/eye-state.ts` | Machine d'état pure : événements serveur → état visible, libellé, outil, modificateurs |

L'intégration à l'API de plugin OpenCode Desktop (enregistrement de l'onglet, abonnement aux événements, forme exacte des payloads) **n'est pas couverte ici**. Utilise l'API réelle et adapte les payloads au type `EyeEvent` de `eye-state.ts`.

---

## 1. Architecture

```
événements serveur ──► EyeStateMachine (eye-state.ts) ──► { state, tool, label, mods, count }
                                                              │
                                     composant Solid <Eye/> ◄─┘
                                       ├─ data-state, data-tool, data-line… sur les SVG
                                       └─ EyeEngine (eye-engine.js) : rAF → variables CSS
```

Règles d'architecture :

- **Un seul attribut pilote l'état** : `data-state` sur le SVG de l'œil et sur le SVG de la scène, avec la même valeur. Tout le CSS des états en dépend.
- **Le moteur n'écrit que des variables CSS** (`--look-x`, `--look-y`, `--lid`, `--pupil`, etc.) et deux attributs (`data-line`). Il ne crée ni ne supprime jamais de nœud DOM.
- **Solid gère les attributs déclaratifs** : `data-state`, `data-tool`, `data-theme`, `data-brow`, `data-reduced`, `data-impatient`, `data-tired`, le badge et la carte de détails.
- **Le moteur lit l'état à chaque frame** via un getter (`getInput()`). Il n'a pas besoin d'être recréé quand l'état change.
- **Les identifiants SVG** (`clipPath`) doivent être uniques par instance : utilise `createUniqueId()`.
- La boucle rAF tourne tant que l'onglet est monté. Mets-la en pause quand l'onglet est masqué (`document.hidden` ou visibilité du panneau) pour ne pas consommer de CPU pour rien.

### Valeurs d'état (`data-state`)

| Valeur | Libellé affiché | Famille |
|---|---|---|
| `idle` | Au repos (« S'ennuie » si modificateur `bored`) | base |
| `think` | Réfléchit | base |
| `respond` | Répond | base |
| `read` | Lit · `<outil>` | outil |
| `write` | Écrit · `<outil>` | outil |
| `shell` | Lance une commande · `<outil>` | outil |
| `generic` | Utilise un outil · `<outil>` | outil |
| `delegate` | Délègue · `<outil>` | outil |
| `web` | Cherche sur le web · `<outil>` | outil |
| `plan` | Planifie · `<outil>` | outil |
| `attention` | T'attend | prioritaire |
| `sleep` | Compacte la conversation | prioritaire |
| `error-flash` | Quelque chose a échoué | erreur |
| `error` | Quelque chose a échoué | erreur |
| `error-spiral` | Quelque chose a échoué | erreur |
| `happy` | Terminé | réaction brève |
| `vexed` | Interrompu | réaction brève |
| `surprised` | Te revoilà | réaction brève |

Quand le modificateur `impatient` est actif sur un outil, le libellé prend le suffixe « · ça traîne ».

---

## 2. Logique d'état

L'implémentation de référence est `reference/eye-state.ts`. Cette section en donne les règles.

### 2.1 Priorités (de la plus forte à la plus faible)

1. **attention** : au moins une permission ou un formulaire en attente.
2. **sleep** : compaction en cours.
3. **erreur** : `error-flash`, `error` ou `error-spiral`.
4. **réaction brève** : `happy`, `vexed` ou `surprised`, tant que sa durée n'est pas écoulée.
5. **outil** : au moins un outil en cours.
6. **activité** : `respond` ou `think`.
7. **idle**.

### 2.2 Événements

| Événement serveur | Effet |
|---|---|
| `session.execution.started`, `session.step.started`, `session.reasoning.started` | activité → `think`. `step.started` efface aussi une erreur de type « jusqu'à l'étape suivante » |
| `session.text.started` | activité → `respond` |
| `session.tool.input.started` | ajoute l'outil (le nom arrive ici), classé selon 2.3 |
| `session.tool.called` sans `input.started` vu avant pour ce `callId` | ajoute l'outil en **générique** (l'œil a raté le début), avec son nom en libellé |
| `session.tool.success` | retire l'outil ; s'il n'en reste aucun → activité `think` |
| `session.tool.failed` | retire l'outil ; erreur `error-flash` pendant 1 500 ms, puis l'œil reprend ce qu'il faisait |
| `permission.asked` → `permission.replied` | `attention` pendant l'attente, puis retour à l'état d'avant. Si la réponse est un refus → réaction `vexed` |
| `form.created` → `form.replied` / `form.cancelled` | `attention` (question posée par l'outil question) |
| `session.compaction.started` → `session.compaction.ended` | `sleep` |
| `session.execution.succeeded` | vide les outils, activité `idle`, réaction `happy` pendant 1 100 ms |
| `session.execution.interrupted` | vide les outils, activité `idle`, réaction `vexed` pendant 1 300 ms |
| Envoi d'un nouveau prompt | efface les erreurs « jusqu'au prochain prompt » |
| Fenêtre de nouveau visible après au moins 30 s d'absence (`visibilitychange`, côté client) | réaction `surprised` pendant 1 200 ms |

### 2.3 Classification des outils

| Type (`data-state`) | Outils | Badge |
|---|---|---|
| `read` | read, grep, glob, search, list, ls, find, codesearch | loupe |
| `write` | patch, apply_patch, edit, multiedit, write | crayon |
| `shell` | shell, bash, terminal | terminal |
| `delegate` | task, subagent | branche |
| `web` | webfetch, websearch | globe |
| `plan` | todowrite, todoread | checklist |
| `generic` | tout le reste : MCP, execute… | puzzle |

Pour `execute`, le libellé et l'icône montrent **l'outil appelé à l'intérieur** (par exemple `execute` → `mantis.get_issue`). L'outil interne est classé avec la même table, et reste générique s'il n'y figure pas.

**Outils en parallèle** : on affiche la variante la plus « intense », dans l'ordre `write` > `shell` > `delegate` > `read` > `web` > `plan` > `generic`. Le badge affiche un compteur `×N` quand N > 1.

### 2.4 Erreurs

| Événement | Durée de l'erreur | `data-state` |
|---|---|---|
| `session.tool.failed` | éclair de 1,5 s, puis l'œil reprend ce qu'il faisait | `error-flash` |
| `session.step.failed` | durable, jusqu'au prochain `step.started` | `error` |
| `session.execution.failed` | durable, avec spirale, jusqu'au prochain prompt | `error-spiral` |
| `session.compaction.failed` | durable, jusqu'à la prochaine compaction ou au prochain prompt | `error` |
| N'importe quel événement de type **`aborted`** | **pas une erreur** : c'est un refus d'approbation ou une interruption de l'utilisateur → réaction `vexed` | `vexed` |

### 2.5 Stabilité de l'affichage (obligatoire)

Sans ces règles, l'œil clignote d'un état à l'autre quand les outils s'enchaînent.

- **Temps minimum par état** : un état visible reste affiché **au moins 400 ms** avant de céder la place, sauf devant `attention`, une erreur ou `sleep`, qui passent immédiatement.
- **Délai avant réflexion** : le passage d'un outil vers `think` attend **250 ms**. Si un autre outil démarre entre-temps, on passe directement d'un outil à l'autre, sans passer par `think`.
- Les réactions brèves et `error-flash` ont une durée fixe et ne sont pas prolongées par le temps minimum.

### 2.6 Modificateurs (dérivés du temps)

| Modificateur | Condition | Effet |
|---|---|---|
| `impatient` | l'outil affiché tourne depuis plus de 15 s | toutes les 2,8 s : regard vers l'utilisateur, puis soupir ; sablier |
| `bored` | `idle` depuis plus de 2 min sans aucun événement | paupière lourde, regard lent ; libellé « S'ennuie » |
| `tired` | usage du contexte au-dessus de 80 % (si l'information est disponible) | paupière alourdie de 0,2 en permanence ; tasse de café |

Les modificateurs se combinent avec l'état. Ils sont exposés sur l'élément racine via `data-impatient="on|off"` et `data-tired="on|off"`, et transmis au moteur via `getInput().mods`.

---

## 3. Dessin

Référence : `reference/eye.html`.

### 3.1 L'œil (viewBox `0 -30 200 230`, ratio hauteur = 1,15 × largeur)

Le centre de l'œil est en (100, 100).

| Élément | Géométrie | Rôle |
|---|---|---|
| `.ring` | cercle r = 72, trait `--stroke-w`, fond `--fill` | contour de l'œil |
| `.ticks` | 5 cils, segments de r ≈ 81 à r ≈ 92 autour du centre, à −44°, −22°, 0°, 22°, 44° | cils ; ils suivent la paupière |
| `.pup` | disque r = 17, couleur `--pupil-c` | pupille, découpée par le cercle |
| `.brow` | `M 64 -6 Q 100 -20 136 -6` | sourcil (désactivable avec `data-brow="off"`) |
| `.lids` | groupe | paupière : `scaleY(1 − lid × 0,94)` autour de (100, 100) |
| `.smile` | `M 46 112 Q 100 48 154 112` | arc « ^ » de l'état `happy` |
| `.spiral-g` | spirale d'Archimède r = 2 + 1,75 θ, θ ∈ [0, 7π] | erreur durable avec spirale |
| `.halo` | cercle r = 72 | pulsation de l'état `attention` |
| `.bubble` | 2 cercles et une ellipse (174, −42) 32 × 21, 3 points | bulle de réflexion, retournée selon le côté du regard |
| `.stars` | 3 étincelles à r ≈ 90 | erreurs |
| `.confetti` | 10 rectangles 3,5 × 9 | `happy` |
| `.hourglass` | en (16, 4) | modificateur `impatient` |
| `.coffee` | en (18, 170) | modificateur `tired` |

### 3.2 La scène sous l'œil (viewBox `0 0 200 120`, hauteur = 0,6 × largeur de l'œil)

Un accessoire par état. Chacun apparaît avec un petit rebond : depuis `translateY(18) scale(.6)`, en 0,5 s avec `cubic-bezier(.34, 1.56, .64, 1)`.

| État | Accessoire | Interaction avec l'œil |
|---|---|---|
| `read` | feuille de 4 lignes et loupe | la loupe parcourt les lignes, la ligne en cours s'allume (`data-line`), l'œil suit la loupe |
| `write` | même feuille et crayon | le crayon trace les lignes, l'œil suit la pointe |
| `shell` | terminal : lignes qui défilent, curseur qui clignote | l'œil le fixe |
| `generic` | pièce de puzzle qui tourne | elle saute d'un point à l'autre, l'œil la suit |
| `delegate` | mini-œil (r = 20, pupille r = 7, 3 cils) | les deux se regardent, puis le petit part travailler et le grand le surveille |
| `web` | globe dont les méridiens tournent | l'œil regarde au loin par-dessus |
| `plan` | checklist de 4 cases | les coches se tracent une à une, le regard suit la case |
| `respond` | bulle de dialogue avec 3 lignes | les lignes s'écrivent |
| `attention` | « ? » suspendu | il se balance |
| `sleep` | oreiller | il respire |

### 3.3 Badge et carte de détails

- **Badge** (HTML, en haut à droite de l'œil) : icône de l'outil + nom, compteur `×N` si plusieurs outils tournent. Il apparaît avec un rebond de 0,45 s. Les icônes au trait de la référence sont des **remplaçants** : utilise celles de l'application.
- **Clic sur l'œil** (l'œil est un `<button>`) : clignement, deuxième clignement à +200 ms, puis à +380 ms la carte s'ouvre. Elle contient :
  - l'outil en cours (et le nombre d'outils en parallèle) ;
  - la durée dans l'état courant, mise à jour chaque seconde ;
  - les 5 dernières transitions, avec l'heure et l'événement déclencheur.

  Un deuxième clic, ou le bouton ×, la ferme. Échap doit aussi la fermer.

### 3.4 Tokens

Toutes les couleurs et tailles sont des variables CSS (voir `eye.css`).

| Variable | Sombre | Clair |
|---|---|---|
| `--contour` | `#8fb3ff` | `#2f55c8` |
| `--pupil-c` | `= --contour` | `= --contour` |
| `--fill` | `color-mix(in oklch, var(--contour) 9%, transparent)` | idem |
| `--err` | `#ff9a6b` | `#c2410c` |
| `--bg` / `--bg2` / `--line` | `#16181d` / `#1c1f25` / `#2a2e36` | `#fbfbfa` / `#f1f1ee` / `#dcdbd6` |
| `--muted` | `#8d929d` | `#5d616a` |
| `--stroke-w` | `3.5` (unités du viewBox) | idem |

**Intègre ces valeurs aux tokens du thème d'OpenCode** au lieu de les coder en dur : `--bg` et `--muted` doivent venir du thème de l'application. `--contour` peut rester l'accent propre au plugin.

La taille de l'œil est réglable de 80 à 300 px de large. Par défaut, il occupe environ 60 % de la largeur du panneau. Sous 120 px, masque la scène, la bulle et les confettis : seul l'œil reste lisible à cette taille.

---

## 4. Moteur d'animation

Référence : `reference/eye-engine.js`. Porte-le tel quel : les valeurs ont été réglées à l'œil.

### 4.1 Modèle de ressort

Chaque grandeur animée suit un ressort amorti, intégré à chaque frame (pas = dt / 16,667 ms, borné à [0,25 ; 3], subdivisé en pas ≤ 1) :

```
v += ((cible − x) · k − v · c) · h
x += v · h
```

Avec k ≈ 0,1 et c ≈ 0,35, le ressort est sous-amorti : il dépasse légèrement sa cible, ce qui donne le côté élastique. **Aucun mouvement n'est linéaire.**

| Grandeur | k | c | Note |
|---|---|---|---|
| Regard (`x`, `y`) | 0,12 par défaut, variable selon l'état (voir 4.4) | 0,40 | amplitude : x × 40, y × 36 unités du viewBox |
| Paupière (`lid`) | 0,07 | 0,34 | sauf `sleep`, piloté directement par le temps |
| Sourcil (`by`, `br`) | 0,10 | 0,35 | `by` en unités du viewBox, `br` en degrés |
| Coup d'échelle (`kick`) | 0,18 | 0,22 | cible 1 ; reçoit une impulsion de vitesse à l'entrée de certains états |
| Côté de la bulle (`bs`) | 0,12 | 0,30 | cible ±1 ; passe par 0, ce qui « retourne » la bulle |
| Pièce de puzzle (`zx`, `zy`) | 0,20 | 0,45 | |
| Mini-œil (`mix`, `miy`) | 0,15 | 0,40 | |
| Pupille (échelle) | lissage exponentiel 0,12 × dt | | |

### 4.2 Variables écrites par le moteur

- **Sur le SVG de l'œil** : `--look-x`, `--look-y`, `--lid`, `--pupil`, `--brow-y`, `--brow-r`, `--kick`, `--shake`, `--bub-s`.
- **Sur le SVG de la scène** : `--lx`, `--ly` (loupe), `--px`, `--py`, `--pr` (crayon), `--w0` à `--w3` (lignes écrites, 1 = vide, 0 = pleine), `--c0` à `--c3` (coches), `--zx`, `--zy` (puzzle), `--mix`, `--miy`, `--mpx`, `--mpy` (mini-œil).
- **Attributs** : `data-line` (ligne lue, 0 à 3), sur la scène et sur l'œil.

### 4.3 Clignements

- **Durée** : 180 ms. Fermeture sur 40 % du temps (sinus), ouverture sur 60 % (easing cubique de sortie). Valeur appliquée : `lid + (1 − lid) × b`.
- **Fréquence** : un clignement toutes les 2,4 à 6,6 s en `idle`, toutes les 3,8 à 8 s ailleurs. Dans 18 % des cas, le clignement est double, avec un second clignement 280 ms plus tard.
- **États sans clignement** : `attention`, `sleep`, `error-flash`, `error-spiral`, `happy`, `surprised`.

### 4.4 Paramètres par état

Unités du regard : −1 à 1 (multipliées par 40 en x et 36 en y). Pupille : facteur d'échelle. Paupière : 0 (ouverte) à 1 (fermée). Sourcil : `by` en unités du viewBox (négatif = levé), `br` en degrés. T = temps écoulé depuis l'entrée dans l'état (ms).

| État | Regard (cible) | Pupille | Paupière | Sourcil | Ressort regard | Particularités |
|---|---|---|---|---|---|---|
| `idle` | direction du curseur × min(1, distance / (1,1 × largeur de l'œil)). Sans curseur : point aléatoire (±0,45 ; ±0,3) toutes les 1,4 à 3,6 s | 1 + 0,04 sin(t/1100), × 1,14 si le curseur est à moins de 40 px du bord | 0 | 0 | 0,12 / 0,40 | micro-saccades ±0,04 / ±0,05 toutes les 0,5 à 2 s |
| `think` | (côté × 0,62 ; −0,62) + saccades ±0,08 / ±0,06 toutes les 250 à 650 ms | 0,95 | 0 | by −6, br −côté × 9 | 0,16 / 0,45 | le côté change toutes les 3 à 6 s ; la bulle suit le côté |
| `respond` | (0,07 sin(T/900) ; 0,04 + 0,03 sin(T/260)) | 1 + 0,08 · \|sin(T/120)\| · (0,5 + 0,5 sin(T/650)) | 0,05 | by −2 + 2,5 sin(T/260) | défaut | lignes de la bulle : cycle de 3,2 s |
| `read` | suit la loupe : x = (lx − 100) / 40 × 0,75 ; y = 0,5 + (ly − 59) × 0,004 | 0,62 | 0 | by 1 | défaut | 4 lignes ; balayage de 1 150 ms (easeInOutQuad), retour de 320 ms ; loupe lissée à 0,35 par frame |
| `write` | suit la pointe : x = (px − 100) / 40 × 0,75 ; y = 0,58 | 0,8 | 0,45 | by 4 | défaut | 4 lignes de 1 400 ms + 800 ms de pause, crayon levé ; tremblement du crayon y ± 1,3, rotation −4 + 6 sin(T/110) |
| `shell` | (0 ; 0,42) + tremblement ±0,025 par frame | 0,48 | 0,12 | by 6 | 0,30 / 0,55 | défilement du terminal par à-coups (2,6 s pour 3 lignes) ; tremblement coupé en mouvement réduit |
| `generic` | suit la pièce : x = (zx − 100) / 48 × 0,6 ; y = 0,42 + (zy − 60) / 30 × 0,22 | 0,9 | 0 | by −3, br aléatoire ±5 à chaque saut | 0,22 / 0,50 | nouveau point toutes les 350 à 800 ms (rayon 0,35 à 0,8) ; la pièce tourne en 5 s |
| `delegate` | phase 1 (0 à 1 300 ms) : (0 ; 0,62). Phase 2 (1 300 à 3 400 ms) : suit le mini-œil, y = 0,55 | 0,85 | 0 | by −2, br −4 en phase 1 | défaut | mini-œil en phase 1 : centré, pupille (0, −7) qui regarde le grand. En phase 2 : x = 100 + 42 sin(2π w), pupille (±5, 4) |
| `web` | (0,18 sin(T/2400) ; −0,28 + 0,05 sin(T/1700)) | 0,42 | 0 | by −5 | 0,06 / 0,35 | méridiens du globe : 3 s |
| `plan` | (−0,45 ; 0,35 + rang × 0,09), +0,12 vers le bas au moment de cocher | 0,8 | 0 | by 3 | 0,20 / 0,45 | pas de 800 ms × 6 (4 coches + 2 temps de pause) ; chaque coche se trace entre 30 % et 55 % de son pas |
| `attention` | curseur × 0,12 | 1,4 | 0 | by −10 | défaut | impulsion d'échelle +0,06 à l'entrée ; halo qui pulse (1,6 s, échelle 1 → 1,28, opacité 0,55 → 0) ; cils à l'échelle 1,07 ; « ? » qui oscille de ±10° en 1,6 s |
| `sleep` | (0 ; 0,55) | 0,8 | **0 → 1 en 2 600 ms**, easeInOutQuad, sans ressort | by 7 | 0,05 / 0,30 | « z » : 2,6 s, décalés de 0,85 s ; cils à 35 % d'opacité ; l'oreiller respire en 3 s |
| `error-flash` | roule le long du bord : angle T/140 rad, rayon 0,9 | 0,7 | 0,08 | br 12 sin(T/90) | 0,25 / 0,45 | secousse horizontale de 7 unités, amortie de × 0,88 par frame, oscillant en sin(t/22) ; impulsion −0,05 ; couleur `--err` ; étoiles (tour en 2,2 s) |
| `error` | roule : angle T/420, rayon 0,9 | 0,7 | 0,08 | by 3, br 10 sin(T/300) | 0,25 / 0,45 | secousse de 5 ; impulsion −0,04 ; clignements autorisés |
| `error-spiral` | pupille masquée | | | br 10 sin(T/300) | | spirale `--err` qui tourne en 1,8 s |
| `happy` | (0 ; 0) | | cercle masqué (fondu de 0,14 s) | by −9 | | arc « ^ » qui passe de l'échelle 0,5 à 1 en 0,45 s, `cubic-bezier(.34, 1.8, .5, 1)` ; impulsion +0,07 ; confettis (1,1 s, chute de 160 unités, rotation de 260°, décalés de 0 à 0,2 s) |
| `vexed` | (0,82 ; −0,12) | 0,5 | 0,42 | by 7, br −7 | 0,20 / 0,45 | impulsion −0,08 |
| `surprised` | (0 ; −0,1) | 0,4 pendant 220 ms, puis 1,2 | 0 | by −16 | 0,25 / 0,40 | impulsion +0,1 |

**Modificateurs** :

- **`impatient`** (sur les états d'outil) : cycle de 2,8 s.
  - De 0 à 750 ms : regard vers l'utilisateur (curseur × 0,35, ou (0 ; 0,05) sans curseur), pupille 1,05, sourcil by −4 et br −8.
  - De 750 à 1 250 ms : soupir, la paupière monte jusqu'à 0,42 × sin(π u).
  - Le sablier se retourne toutes les 1,8 s.
- **`bored`** (sur `idle`) : paupière 0,42, ressort du regard 0,04 / 0,30, pupille × 0,92, sourcil by 5. Sans curseur, l'errance est réduite à × 0,6 et descend vers le bas.
- **`tired`** : +0,2 sur la paupière, sauf en `attention`, `surprised`, `happy` et `sleep`. Une tasse de café apparaît, avec une vapeur sur un cycle de 2 s.

### 4.5 Transitions

- Le regard, la paupière, le sourcil et l'échelle passent d'un état à l'autre **par leurs ressorts** : aucune transition CSS n'est nécessaire, et un changement d'état en plein mouvement reste fluide.
- Les éléments qui apparaissent (accessoires, bulle, arc, badge) utilisent des transitions CSS élastiques (`cubic-bezier(.34, 1.56, .64, 1)` ou `(.34, 1.8, .5, 1)`), décrites dans `eye.css`.
- **Impulsions d'échelle** à l'entrée d'un état (`kick`, sur la vitesse du ressort d'échelle) :

  | État | Impulsion |
  |---|---|
  | `surprised` | +0,10 |
  | `happy` | +0,07 |
  | `attention` | +0,06 |
  | `vexed` | −0,08 |
  | `error-flash` | −0,05 |
  | `error`, `error-spiral` | −0,04 |

---

## 5. Mouvement réduit

Quand `prefers-reduced-motion: reduce` est actif, ou quand un réglage du plugin le demande, ajoute `data-reduced="on"` sur la racine et passe `reduced: true` au moteur. Dans ce mode :

- Le suivi du curseur, les clignements et les ressorts restent : ce sont des mouvements doux et utiles.
- Plus de tremblement en `shell`, plus de secousse, plus de roulement d'œil en erreur : la pupille se fixe vers le bas, en (0 ; 0,3), et le sourcil est penché de 8°.
- Plus de rotation des étoiles, de la spirale, du puzzle et du globe ; plus de défilement du terminal ni de balancement du « ? ».
- Pas de confettis.
- Les « z » restent visibles mais ne flottent plus. Le halo d'attention devient fixe.

---

## 6. Accessibilité

- L'œil est un `<button>` avec `aria-label="Afficher les détails de l'œil"`. Les SVG sont `aria-hidden`.
- Annonce le libellé de la barre d'état via une région `aria-live="polite"`. Ne l'annonce que pour `attention`, les erreurs et la fin d'exécution, pour ne pas inonder un lecteur d'écran à chaque outil.
- La carte de détails est un `role="dialog"` : on la ferme avec Échap, et le focus revient sur l'œil.

---

## 7. Critères d'acceptation

- [ ] L'œil reproduit les 18 états de la section 1, avec leurs accessoires, en thème clair et en thème sombre.
- [ ] Les événements de la section 2.2 produisent les bons états, y compris les retours après permission, formulaire, éclair d'erreur et réactions brèves.
- [ ] Un événement `aborted` ne déclenche jamais d'erreur, mais une réaction `vexed`.
- [ ] Des outils enchaînés à moins de 250 ms d'intervalle ne font pas passer l'œil par `think`. Aucun état visible ne dure moins de 400 ms, sauf les passages immédiats prévus en 2.5.
- [ ] Avec plusieurs outils en parallèle, la variante affichée suit l'ordre de 2.3 et le badge affiche `×N`.
- [ ] `execute` affiche le nom et l'icône de l'outil appelé à l'intérieur.
- [ ] Les modificateurs `impatient`, `bored` et `tired` s'activent sur leurs seuils.
- [ ] Le rendu reste lisible de 80 à 300 px. Sous 120 px, la scène et les accessoires sont masqués.
- [ ] Le mouvement réduit respecte la section 5.
- [ ] La boucle rAF s'arrête quand l'onglet est masqué ou démonté. Aucune fuite d'écouteurs.
- [ ] Le clic sur l'œil ouvre la carte de détails ; un deuxième clic, le bouton × ou Échap la ferment.
