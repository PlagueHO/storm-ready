# Contributing to StormReady

Thanks for helping StormReady grow! This project is intentionally small and approachable, so
contributions of all sizes are welcome — a new storm scenario, a visual polish, a bug fix, or a
whole new game mechanic.

## Getting set up

```bash
npm install
npm run dev
```

## Before you open a pull request

Please make sure the following all pass locally:

```bash
npm run lint
npm run format:check
npm run test
npm run build
```

## Guiding principles

We aim to keep the codebase easy to read and easy to extend:

- **Clean, self-documenting code** — clear names over clever tricks.
- **SOLID & DRY** — small, focused modules with a single responsibility.
- **Keep game logic pure** — scoring and rules live in `src/lib` with no React or DOM
  dependencies, which keeps them simple to unit test.
- **YAGNI** — build what the feature needs today, not what it might need someday.
- **Test what matters** — cover the game rules and key user flows.

## Adding a new storm scenario

1. Add a new entry to `SCENARIOS` in `src/data/scenarios.ts`.
2. Give it a unique `id`, a `type`, an emoji, a duration, and a set of prep tasks.
3. That's it — the picker, gameplay, and scoring pick it up automatically.

## Commit style

Short, present-tense summaries are perfect, e.g. `Add snowstorm scenario` or
`Fix countdown urgency threshold`.
