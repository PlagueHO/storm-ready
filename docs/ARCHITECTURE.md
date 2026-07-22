# Architecture

StormReady is a single-page React application with **no backend**. Everything runs in the
browser, and the only persistence is the player's best scores in `localStorage`.

## Layered design

The code is organised so that the **game rules are completely decoupled from the UI**. This is
the most important architectural decision in the project: it keeps the rules trivial to test and
lets us change the presentation freely.

```
┌─────────────────────────────────────────────┐
│  features/  (screens: Challenge, Results)    │  ← compose components
├─────────────────────────────────────────────┤
│  components/  (Gauge, Countdown, TaskList…)  │  ← presentational, stateless
├─────────────────────────────────────────────┤
│  hooks/  (useChallenge)                      │  ← owns state + timer lifecycle
├─────────────────────────────────────────────┤
│  lib/  (scoring, storage)   data/  types/    │  ← pure logic, no React/DOM
└─────────────────────────────────────────────┘
```

### `lib/` — pure logic

`scoring.ts` contains only pure functions: given a scenario and the set of completed task ids it
computes the score, grade, badges, and outcome. No React, no side effects — just inputs and
outputs. `storage.ts` isolates the single side-effecting concern (localStorage) behind a small,
defensive API.

### `data/` — static content

`scenarios.ts` holds the built-in storms as plain data. Adding a storm is a data change, not a
code change — the rest of the app is data-driven from here.

### `hooks/useChallenge` — the state machine

The game moves through three phases:

```
picking ──start()──▶ preparing ──finish() / timer hits 0──▶ results
   ▲                                                            │
   └────────────────────── reset() ────────────────────────────┘
```

`useChallenge` owns the current phase, the selected scenario, the completed-task set, and the
countdown timer (a `setTimeout` effect that ticks once per second). It delegates every rule to the
pure helpers in `lib/`.

### `components/` and `features/`

Components are small and presentational — they receive props and render markup. Features compose
those components into full screens. Neither contains game rules.

## Extension points

- **New storms** → add data to `data/scenarios.ts`.
- **New scoring rules / badges** → extend the pure helpers in `lib/scoring.ts` (and their tests).
- **New visuals** → components are isolated and safe to restyle or replace.
- **AI "Preparedness Coach" (future)** → a local LLM via Foundry Local could read the player's
  board and suggest what to prioritise. This would live behind a new module (e.g. `lib/coach.ts`)
  so the core game stays offline and dependency-free.
