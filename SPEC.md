# The eye: implementation spec

An OpenCode Desktop plugin: a tab of the session's side panel shows an animated eye that reflects, at all times, what the agent is doing. The tone is funny and expressive: it is a companion, not a loading indicator.

This document is for the agent that implements the plugin. **The files in `reference/` are authoritative**: they hold the drawing, the CSS and the animation engine validated in the mock-up. The work is to port them to a Solid component and wire them to the server's events, not to redraw them. Their user-facing strings are the French copy; the plugin carries English and French.

| File                      | Role                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `reference/eye.html`      | SVG markup of the eye, of the scene under the eye and of the tool badge                      |
| `reference/eye.css`       | Tokens (light and dark themes), states, props, keyframes, reduced motion                     |
| `reference/eye-engine.js` | Dependency-free animation engine: rAF loop, springs, gaze, blinks. Writes CSS variables only |
| `reference/eye-state.ts`  | Pure state machine: server events → visible state, label, tool, modifiers                    |

The integration with the OpenCode Desktop plugin API (registering the tab, subscribing to events, the exact shape of the payloads) **is not covered here**. Use the real API and adapt the payloads to the `EyeEvent` type of `eye-state.ts`.

---

## 1. Architecture

```
server events ──► EyeStateMachine (eye-state.ts) ──► { state, tool, label, mods, count }
                                                         │
                                Solid component <Eye/> ◄─┘
                                  ├─ data-state, data-tool, data-line… on the SVGs
                                  └─ EyeEngine (eye-engine.js): rAF → CSS variables
```

Architecture rules:

- **One attribute drives the state**: `data-state` on the eye's SVG and on the scene's SVG, with the same value. All the state CSS depends on it.
- **The engine only writes CSS variables** (`--look-x`, `--look-y`, `--lid`, `--pupil`, etc.) and two attributes (`data-line`). It never creates or removes a DOM node.
- **Solid handles the declarative attributes**: `data-state`, `data-tool`, `data-theme`, `data-brow`, `data-reduced`, `data-impatient`, `data-tired`, the badge and the details card.
- **The engine reads the state on every frame** through a getter (`getInput()`). It does not need to be recreated when the state changes.
- **SVG ids** (`clipPath`) must be unique per instance: use `createUniqueId()`.
- The rAF loop runs while the tab is mounted. Pause it while the tab is hidden (`document.hidden` or the panel's visibility) so it does not burn CPU for nothing.

### State values (`data-state`)

| Value          | Label (English)                        | Label (French)                               | Family         |
| -------------- | -------------------------------------- | -------------------------------------------- | -------------- |
| `idle`         | Resting ("Bored" with the `bored` mod) | Au repos (« S'ennuie » with the `bored` mod) | base           |
| `think`        | Thinking                               | Réfléchit                                    | base           |
| `respond`      | Answering                              | Répond                                       | base           |
| `read`         | Reading · `<tool>`                     | Lit · `<tool>`                               | tool           |
| `write`        | Writing · `<tool>`                     | Écrit · `<tool>`                             | tool           |
| `shell`        | Running a command · `<tool>`           | Lance une commande · `<tool>`                | tool           |
| `generic`      | Using a tool · `<tool>`                | Utilise un outil · `<tool>`                  | tool           |
| `delegate`     | Delegating · `<tool>`                  | Délègue · `<tool>`                           | tool           |
| `web`          | Searching the web · `<tool>`           | Cherche sur le web · `<tool>`                | tool           |
| `plan`         | Planning · `<tool>`                    | Planifie · `<tool>`                          | tool           |
| `attention`    | Waiting for you                        | T'attend                                     | priority       |
| `sleep`        | Compacting the conversation            | Compacte la conversation                     | priority       |
| `error-flash`  | Something went wrong                   | Quelque chose a échoué                       | error          |
| `error`        | Something went wrong                   | Quelque chose a échoué                       | error          |
| `error-spiral` | Something went wrong                   | Quelque chose a échoué                       | error          |
| `happy`        | Done                                   | Terminé                                      | short reaction |
| `vexed`        | Interrupted                            | Interrompu                                   | short reaction |
| `surprised`    | Welcome back                           | Te revoilà                                   | short reaction |

When the `impatient` modifier is on during a tool, the label takes the suffix "· taking a while" (« · ça traîne »).

---

## 2. State logic

The reference implementation is `reference/eye-state.ts`. This section gives its rules.

### 2.1 Priorities (strongest first)

1. **attention**: at least one pending permission or form.
2. **sleep**: a compaction in progress.
3. **error**: `error-flash`, `error` or `error-spiral`.
4. **short reaction**: `happy`, `vexed` or `surprised`, until its time is up.
5. **tool**: at least one tool in flight.
6. **activity**: `respond` or `think`.
7. **idle**.

### 2.2 Events

| Server event                                                                           | Effect                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `session.execution.started`, `session.step.started`, `session.reasoning.started`       | activity → `think`. `step.started` also clears an error of the "until the next step" kind                  |
| `session.text.started`                                                                 | activity → `respond`                                                                                       |
| `session.tool.input.started`                                                           | adds the tool (its name arrives here), classified as in 2.3                                                |
| `session.tool.called` with no `input.started` seen before for this `callId`            | adds the tool as **generic** (the eye missed its start), with its name as the label                        |
| `session.tool.success`                                                                 | removes the tool; if none is left → activity `think`                                                       |
| `session.tool.failed`                                                                  | removes the tool; `error-flash` error for 1,500 ms, then the eye carries on with what it was doing         |
| `permission.asked` → `permission.replied`                                              | `attention` while waiting, then back to the previous state. If the reply is a rejection → `vexed` reaction |
| `form.created` → `form.replied` / `form.cancelled`                                     | `attention` (a question asked by the question tool)                                                        |
| `session.compaction.started` → `session.compaction.ended`                              | `sleep`                                                                                                    |
| `session.execution.succeeded`                                                          | clears the tools, activity `idle`, `happy` reaction for 1,100 ms                                           |
| `session.execution.interrupted`                                                        | clears the tools, activity `idle`, `vexed` reaction for 1,300 ms                                           |
| A new prompt is sent                                                                   | clears the errors that last "until the next prompt"                                                        |
| The window is visible again after at least 30 s away (`visibilitychange`, client side) | `surprised` reaction for 1,200 ms                                                                          |

### 2.3 Tool classification

| Kind (`data-state`) | Tools                                                | Badge     |
| ------------------- | ---------------------------------------------------- | --------- |
| `read`              | read, grep, glob, search, list, ls, find, codesearch | magnifier |
| `write`             | patch, apply_patch, edit, multiedit, write           | pencil    |
| `shell`             | shell, bash, terminal                                | terminal  |
| `delegate`          | task, subagent                                       | branch    |
| `web`               | webfetch, websearch                                  | globe     |
| `plan`              | todowrite, todoread                                  | checklist |
| `generic`           | everything else: MCP, execute…                       | puzzle    |

For `execute`, the label and the icon show **the tool called inside** (for example `execute` → `tracker.get_issue`). The inner tool is classified with the same table, and stays generic when it is not in it.

**Parallel tools**: show the most "intense" kind, in the order `write` > `shell` > `delegate` > `read` > `web` > `plan` > `generic`. The badge shows a `×N` counter when N > 1.

### 2.4 Errors

| Event                               | How long the error lasts                                                              | `data-state`   |
| ----------------------------------- | ------------------------------------------------------------------------------------- | -------------- |
| `session.tool.failed`               | a 1.5 s flash, then the eye carries on with what it was doing                         | `error-flash`  |
| `session.step.failed`               | lasting, until the next `step.started`                                                | `error`        |
| `session.execution.failed`          | lasting, with a spiral, until the next prompt                                         | `error-spiral` |
| `session.compaction.failed`         | lasting, until the next compaction or the next prompt                                 | `error`        |
| Any event of the **`aborted`** type | **not an error**: a declined approval or the user stopping the run → `vexed` reaction | `vexed`        |

### 2.5 Display stability (required)

Without these rules, the eye flickers from one state to the next when tools follow one another.

- **Minimum time per state**: a visible state shows for **at least 400 ms** before giving way, except to `attention`, an error or `sleep`, which go through at once.
- **Delay before thinking**: going from a tool to `think` waits **250 ms**. If another tool starts in the meantime, the eye goes straight from one tool to the other, without going through `think`.
- Short reactions and `error-flash` have a fixed length and are not lengthened by the minimum time.

### 2.6 Modifiers (derived from time)

| Modifier    | Condition                                                 | Effect                                                |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------- |
| `impatient` | the tool shown has been running for more than 15 s        | every 2.8 s: looks at the user, then sighs; hourglass |
| `bored`     | `idle` for more than 2 min without any event              | heavy lid, slow gaze; label "Bored"                   |
| `tired`     | context usage above 80 % (when that information is known) | lid 0.2 heavier at all times; cup of coffee           |

Modifiers combine with the state. They are exposed on the root element as `data-impatient="on|off"` and `data-tired="on|off"`, and passed to the engine through `getInput().mods`.

---

## 3. Drawing

Reference: `reference/eye.html`.

### 3.1 The eye (viewBox `0 -30 200 230`, height = 1.15 × width)

The eye's center is at (100, 100).

| Element      | Geometry                                                                                | Role                                            |
| ------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `.ring`      | circle r = 72, stroke `--stroke-w`, fill `--fill`                                       | the eye's outline                               |
| `.ticks`     | 5 lashes, segments from r ≈ 81 to r ≈ 92 around the center, at −44°, −22°, 0°, 22°, 44° | lashes; they follow the lid                     |
| `.pup`       | disc r = 17, color `--pupil-c`                                                          | pupil, clipped by the circle                    |
| `.brow`      | `M 64 -6 Q 100 -20 136 -6`                                                              | brow (can be turned off with `data-brow="off"`) |
| `.lids`      | group                                                                                   | lid: `scaleY(1 − lid × 0.94)` around (100, 100) |
| `.smile`     | `M 46 112 Q 100 48 154 112`                                                             | the "^" arc of the `happy` state                |
| `.spiral-g`  | Archimedean spiral r = 2 + 1.75 θ, θ ∈ [0, 7π]                                          | lasting error with a spiral                     |
| `.halo`      | circle r = 72                                                                           | the pulse of the `attention` state              |
| `.bubble`    | 2 circles and an ellipse (174, −42) 32 × 21, 3 dots                                     | thought bubble, flipped with the gaze's side    |
| `.stars`     | 3 sparkles at r ≈ 90                                                                    | errors                                          |
| `.confetti`  | 10 rectangles 3.5 × 9                                                                   | `happy`                                         |
| `.hourglass` | at (16, 4)                                                                              | `impatient` modifier                            |
| `.coffee`    | at (18, 170)                                                                            | `tired` modifier                                |

### 3.2 The scene under the eye (viewBox `0 0 200 120`, height = 0.6 × the eye's width)

One prop per state. Each comes in with a small bounce: from `translateY(18) scale(.6)`, in 0.5 s with `cubic-bezier(.34, 1.56, .64, 1)`.

| State       | Prop                                         | Interaction with the eye                                                                        |
| ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `read`      | a sheet with 4 lines and a magnifier         | the magnifier goes over the lines, the current line lights up (`data-line`), the eye follows it |
| `write`     | the same sheet and a pencil                  | the pencil draws the lines, the eye follows its tip                                             |
| `shell`     | a terminal: scrolling lines, blinking cursor | the eye stares at it                                                                            |
| `generic`   | a spinning puzzle piece                      | it jumps from point to point, the eye follows it                                                |
| `delegate`  | a mini eye (r = 20, pupil r = 7, 3 lashes)   | they look at each other, then the small one goes to work and the big one watches it             |
| `web`       | a globe with turning meridians               | the eye looks far away, over it                                                                 |
| `plan`      | a checklist of 4 boxes                       | the checks draw one by one, the gaze follows the box                                            |
| `respond`   | a speech bubble with 3 lines                 | the lines write themselves                                                                      |
| `attention` | a hanging "?"                                | it swings                                                                                       |
| `sleep`     | a pillow                                     | it breathes                                                                                     |

### 3.3 Badge and details card

- **Badge** (HTML, top right of the eye): the tool's icon + its name, a `×N` counter when several tools run. It comes in with a 0.45 s bounce. The line icons of the reference are **placeholders**: use the app's.
- **Click on the eye** (the eye is a `<button>`): a blink, a second blink at +200 ms, then at +380 ms the card opens. It holds:
  - the tool in flight (and the number of tools in parallel);
  - how long the current state has lasted, updated every second;
  - the 5 latest transitions, with their time and the event that caused them.

  A second click, or the × button, closes it. Escape must close it too.

### 3.4 Tokens

Every color and size is a CSS variable (see `eye.css`).

| Variable                    | Dark                                                  | Light                             |
| --------------------------- | ----------------------------------------------------- | --------------------------------- |
| `--contour`                 | `#8fb3ff`                                             | `#2f55c8`                         |
| `--pupil-c`                 | `= --contour`                                         | `= --contour`                     |
| `--fill`                    | `color-mix(in oklch, var(--contour) 9%, transparent)` | same                              |
| `--err`                     | `#ff9a6b`                                             | `#c2410c`                         |
| `--bg` / `--bg2` / `--line` | `#16181d` / `#1c1f25` / `#2a2e36`                     | `#fbfbfa` / `#f1f1ee` / `#dcdbd6` |
| `--muted`                   | `#8d929d`                                             | `#5d616a`                         |
| `--stroke-w`                | `3.5` (viewBox units)                                 | same                              |

**Wire these values to OpenCode's theme tokens instead of hard-coding them**: `--bg` and `--muted` must come from the app's theme. `--contour` may stay the plugin's own accent.

The eye's size can be set from 80 to 300 px wide. By default, it takes about 60 % of the panel's width. Under 120 px, hide the scene, the bubble and the confetti: only the eye stays readable at that size.

---

## 4. Animation engine

Reference: `reference/eye-engine.js`. Port it as is: the values were tuned by eye.

### 4.1 Spring model

Each animated value follows a damped spring, integrated on every frame (step = dt / 16.667 ms, clamped to [0.25; 3], split into steps ≤ 1):

```
v += ((target − x) · k − v · c) · h
x += v · h
```

With k ≈ 0.1 and c ≈ 0.35, the spring is underdamped: it overshoots its target slightly, which gives the springy feel. **No motion is linear.**

| Value                     | k                                          | c    | Note                                                      |
| ------------------------- | ------------------------------------------ | ---- | --------------------------------------------------------- |
| Gaze (`x`, `y`)           | 0.12 by default, varies by state (see 4.4) | 0.40 | amplitude: x × 40, y × 36 viewBox units                   |
| Lid (`lid`)               | 0.07                                       | 0.34 | except `sleep`, driven by time directly                   |
| Brow (`by`, `br`)         | 0.10                                       | 0.35 | `by` in viewBox units, `br` in degrees                    |
| Scale kick (`kick`)       | 0.18                                       | 0.22 | target 1; gets a velocity impulse on entering some states |
| Bubble side (`bs`)        | 0.12                                       | 0.30 | target ±1; goes through 0, which "flips" the bubble       |
| Puzzle piece (`zx`, `zy`) | 0.20                                       | 0.45 |                                                           |
| Mini eye (`mix`, `miy`)   | 0.15                                       | 0.40 |                                                           |
| Pupil (scale)             | exponential smoothing 0.12 × dt            |      |                                                           |

### 4.2 Variables the engine writes

- **On the eye's SVG**: `--look-x`, `--look-y`, `--lid`, `--pupil`, `--brow-y`, `--brow-r`, `--kick`, `--shake`, `--bub-s`.
- **On the scene's SVG**: `--lx`, `--ly` (magnifier), `--px`, `--py`, `--pr` (pencil), `--w0` to `--w3` (written lines, 1 = empty, 0 = full), `--c0` to `--c3` (checks), `--zx`, `--zy` (puzzle), `--mix`, `--miy`, `--mpx`, `--mpy` (mini eye).
- **Attributes**: `data-line` (the line being read, 0 to 3), on the scene and on the eye.

### 4.3 Blinks

- **Length**: 180 ms. Closing over 40 % of the time (sine), opening over 60 % (cubic ease-out). Value applied: `lid + (1 − lid) × b`.
- **Frequency**: a blink every 2.4 to 6.6 s in `idle`, every 3.8 to 8 s elsewhere. 18 % of the time the blink is double, with a second blink 280 ms later.
- **States without blinks**: `attention`, `sleep`, `error-flash`, `error-spiral`, `happy`, `surprised`.

### 4.4 Parameters per state

Gaze units: −1 to 1 (times 40 in x and 36 in y). Pupil: scale factor. Lid: 0 (open) to 1 (closed). Brow: `by` in viewBox units (negative = raised), `br` in degrees. T = time since entering the state (ms).

| State          | Gaze (target)                                                                                                                       | Pupil                                                                     | Lid                                             | Brow                             | Gaze spring | Particulars                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | toward the pointer × min(1, distance / (1.1 × the eye's width)). Without a pointer: a random point (±0.45; ±0.3) every 1.4 to 3.6 s | 1 + 0.04 sin(t/1100), × 1.14 when the pointer is within 40 px of the edge | 0                                               | 0                                | 0.12 / 0.40 | micro-saccades ±0.04 / ±0.05 every 0.5 to 2 s                                                                                                                   |
| `think`        | (side × 0.62; −0.62) + saccades ±0.08 / ±0.06 every 250 to 650 ms                                                                   | 0.95                                                                      | 0                                               | by −6, br −side × 9              | 0.16 / 0.45 | the side changes every 3 to 6 s; the bubble follows the side                                                                                                    |
| `respond`      | (0.07 sin(T/900); 0.04 + 0.03 sin(T/260))                                                                                           | 1 + 0.08 · \|sin(T/120)\| · (0.5 + 0.5 sin(T/650))                        | 0.05                                            | by −2 + 2.5 sin(T/260)           | default     | bubble lines: a 3.2 s cycle                                                                                                                                     |
| `read`         | follows the magnifier: x = (lx − 100) / 40 × 0.75; y = 0.5 + (ly − 59) × 0.004                                                      | 0.62                                                                      | 0                                               | by 1                             | default     | 4 lines; 1,150 ms sweep (easeInOutQuad), 320 ms return; magnifier smoothed at 0.35 per frame                                                                    |
| `write`        | follows the tip: x = (px − 100) / 40 × 0.75; y = 0.58                                                                               | 0.8                                                                       | 0.45                                            | by 4                             | default     | 4 lines of 1,400 ms + 800 ms of pause, pencil lifted; pencil jitter y ± 1.3, rotation −4 + 6 sin(T/110)                                                         |
| `shell`        | (0; 0.42) + jitter ±0.025 per frame                                                                                                 | 0.48                                                                      | 0.12                                            | by 6                             | 0.30 / 0.55 | the terminal scrolls in jolts (2.6 s for 3 lines); no jitter with reduced motion                                                                                |
| `generic`      | follows the piece: x = (zx − 100) / 48 × 0.6; y = 0.42 + (zy − 60) / 30 × 0.22                                                      | 0.9                                                                       | 0                                               | by −3, br random ±5 at each jump | 0.22 / 0.50 | a new point every 350 to 800 ms (radius 0.35 to 0.8); the piece turns in 5 s                                                                                    |
| `delegate`     | phase 1 (0 to 1,300 ms): (0; 0.62). Phase 2 (1,300 to 3,400 ms): follows the mini eye, y = 0.55                                     | 0.85                                                                      | 0                                               | by −2, br −4 in phase 1          | default     | mini eye in phase 1: centered, pupil (0, −7) looking at the big one. In phase 2: x = 100 + 42 sin(2π w), pupil (±5, 4)                                          |
| `web`          | (0.18 sin(T/2400); −0.28 + 0.05 sin(T/1700))                                                                                        | 0.42                                                                      | 0                                               | by −5                            | 0.06 / 0.35 | globe meridians: 3 s                                                                                                                                            |
| `plan`         | (−0.45; 0.35 + row × 0.09), +0.12 down while checking                                                                               | 0.8                                                                       | 0                                               | by 3                             | 0.20 / 0.45 | steps of 800 ms × 6 (4 checks + 2 beats of pause); each check draws between 30 % and 55 % of its step                                                           |
| `attention`    | pointer × 0.12                                                                                                                      | 1.4                                                                       | 0                                               | by −10                           | default     | +0.06 scale impulse on entering; pulsing halo (1.6 s, scale 1 → 1.28, opacity 0.55 → 0); lashes at scale 1.07; "?" swinging ±10° in 1.6 s                       |
| `sleep`        | (0; 0.55)                                                                                                                           | 0.8                                                                       | **0 → 1 in 2,600 ms**, easeInOutQuad, no spring | by 7                             | 0.05 / 0.30 | "z": 2.6 s, 0.85 s apart; lashes at 35 % opacity; the pillow breathes in 3 s                                                                                    |
| `error-flash`  | rolls along the edge: angle T/140 rad, radius 0.9                                                                                   | 0.7                                                                       | 0.08                                            | br 12 sin(T/90)                  | 0.25 / 0.45 | horizontal shake of 7 units, damped × 0.88 per frame, oscillating in sin(t/22); −0.05 impulse; `--err` color; stars (one turn in 2.2 s)                         |
| `error`        | rolls: angle T/420, radius 0.9                                                                                                      | 0.7                                                                       | 0.08                                            | by 3, br 10 sin(T/300)           | 0.25 / 0.45 | shake of 5; −0.04 impulse; blinks allowed                                                                                                                       |
| `error-spiral` | pupil hidden                                                                                                                        |                                                                           |                                                 | br 10 sin(T/300)                 |             | `--err` spiral turning in 1.8 s                                                                                                                                 |
| `happy`        | (0; 0)                                                                                                                              |                                                                           | circle hidden (0.14 s fade)                     | by −9                            |             | "^" arc going from scale 0.5 to 1 in 0.45 s, `cubic-bezier(.34, 1.8, .5, 1)`; +0.07 impulse; confetti (1.1 s, a 160-unit fall, 260° rotation, 0 to 0.2 s apart) |
| `vexed`        | (0.82; −0.12)                                                                                                                       | 0.5                                                                       | 0.42                                            | by 7, br −7                      | 0.20 / 0.45 | −0.08 impulse                                                                                                                                                   |
| `surprised`    | (0; −0.1)                                                                                                                           | 0.4 for 220 ms, then 1.2                                                  | 0                                               | by −16                           | 0.25 / 0.40 | +0.1 impulse                                                                                                                                                    |

**Modifiers**:

- **`impatient`** (on tool states): a 2.8 s cycle.
  - From 0 to 750 ms: looks at the user (pointer × 0.35, or (0; 0.05) without a pointer), pupil 1.05, brow by −4 and br −8.
  - From 750 to 1,250 ms: a sigh, the lid rises to 0.42 × sin(π u).
  - The hourglass flips every 1.8 s.
- **`bored`** (on `idle`): lid 0.42, gaze spring 0.04 / 0.30, pupil × 0.92, brow by 5. Without a pointer, the wandering shrinks to × 0.6 and drifts down.
- **`tired`**: +0.2 on the lid, except in `attention`, `surprised`, `happy` and `sleep`. A cup of coffee appears, with steam on a 2 s cycle.

### 4.5 Transitions

- The gaze, the lid, the brow and the scale go from one state to the next **through their springs**: no CSS transition is needed, and a change of state mid-motion stays smooth.
- Elements that appear (props, bubble, arc, badge) use springy CSS transitions (`cubic-bezier(.34, 1.56, .64, 1)` or `(.34, 1.8, .5, 1)`), described in `eye.css`.
- **Scale impulses** on entering a state (`kick`, on the scale spring's velocity):

  | State                   | Impulse |
  | ----------------------- | ------- |
  | `surprised`             | +0.10   |
  | `happy`                 | +0.07   |
  | `attention`             | +0.06   |
  | `vexed`                 | −0.08   |
  | `error-flash`           | −0.05   |
  | `error`, `error-spiral` | −0.04   |

---

## 5. Reduced motion

When `prefers-reduced-motion: reduce` is on, or when a plugin setting asks for it, add `data-reduced="on"` on the root and pass `reduced: true` to the engine. In this mode:

- Pointer tracking, blinks and springs stay: they are gentle, useful motions.
- No more jitter in `shell`, no shake, no eye roll on errors: the pupil settles down, at (0; 0.3), and the brow tilts by 8°.
- No more spinning stars, spiral, puzzle or globe; no more terminal scroll or "?" swing.
- No confetti.
- The "z"s stay visible but no longer float. The attention halo becomes still.

---

## 6. Accessibility

- The eye is a `<button>` with `aria-label="Show the eye's details"`. The SVGs are `aria-hidden`.
- Announce the status bar's label through an `aria-live="polite"` region. Only announce it for `attention`, the errors and the end of a run, so a screen reader is not flooded on every tool.
- The details card is a `role="dialog"`: Escape closes it, and the focus goes back to the eye.

---

## 7. Acceptance criteria

- [ ] The eye reproduces the 18 states of section 1, with their props, in the light and dark themes.
- [ ] The events of section 2.2 produce the right states, including the returns after a permission, a form, an error flash and short reactions.
- [ ] An `aborted` event never triggers an error, but a `vexed` reaction.
- [ ] Tools chained less than 250 ms apart do not go through `think`. No visible state lasts less than 400 ms, except for the immediate changes of 2.5.
- [ ] With several tools in parallel, the variant shown follows the order of 2.3 and the badge shows `×N`.
- [ ] `execute` shows the name and the icon of the tool called inside.
- [ ] The `impatient`, `bored` and `tired` modifiers turn on at their thresholds.
- [ ] The drawing stays readable from 80 to 300 px. Under 120 px, the scene and the props are hidden.
- [ ] Reduced motion follows section 5.
- [ ] The rAF loop stops when the tab is hidden or unmounted. No leaked listeners.
- [ ] A click on the eye opens the details card; a second click, the × button or Escape closes it.
