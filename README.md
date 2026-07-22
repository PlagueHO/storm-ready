# StormReady ⛈️

> Beat the storm before it hits.

**StormReady** is a small, fun, front-end-only web game about getting your home ready for a
storm. A storm is incoming and a countdown is ticking — complete preparation tasks to raise your
live **Resilience Score**, then see how your home fared when the storm hits.

It is deliberately simple, visual, and dependency-light so it runs entirely in your browser with
no backend, no accounts, and no data leaving your machine.

## Why this exists

StormReady is the greenfield sample application used in a hands-on workshop on modern, agentic
software development. It starts intentionally minimal and is designed to be **extended live** —
new storms, new mechanics, richer visuals, accessibility passes, and (later) a local-LLM
"Preparedness Coach" powered by [Foundry Local](https://learn.microsoft.com/azure/ai-foundry/foundry-local/).

## Features

- 🌊 Four storm scenarios (flood, cyclone, hail, heatwave), each with themed prep tasks
- ⏱️ Real-time countdown that builds tension as the storm approaches
- 📈 Live, weighted resilience score with an animated gauge
- 🏅 Playful badges and a letter-grade storm outcome
- 🥇 Personal-best scores saved locally (via `localStorage`)
- ♿ Keyboard-friendly, semantic HTML with ARIA labels

## Tech stack

| Concern   | Choice                          |
| --------- | ------------------------------- |
| UI        | React 18 + TypeScript (strict)  |
| Build/dev | Vite 6                          |
| Tests     | Vitest + React Testing Library  |
| Quality   | ESLint (flat config) + Prettier |
| Styling   | Plain CSS (no framework)        |

## Getting started

Prerequisites: **Node.js 20+** and npm.

```bash
npm install      # install dependencies
npm run dev      # start the local dev server (http://localhost:5173)
```

### Dev Container / Codespaces

This repo includes a preconfigured `.devcontainer` for both GitHub Codespaces and local Docker-based Dev Containers.

- **Codespaces:** open the repo in a new Codespace; dependencies are installed automatically.
- **Local:** in VS Code, run **Dev Containers: Reopen in Container**.

Then run:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

### Useful scripts

| Script                  | What it does                        |
| ----------------------- | ----------------------------------- |
| `npm run dev`           | Start the Vite dev server           |
| `npm run build`         | Type-check and build for production |
| `npm run preview`       | Preview the production build        |
| `npm run test`          | Run unit + component tests once     |
| `npm run test:watch`    | Run tests in watch mode             |
| `npm run test:coverage` | Run tests with a coverage report    |
| `npm run lint`          | Lint the codebase                   |
| `npm run format`        | Format the codebase with Prettier   |

## Project structure

```
src/
├── components/   Reusable presentational components (gauge, countdown, task list…)
├── features/     Screen-level features composed from components (challenge, results)
├── hooks/        React hooks that own state and lifecycle (useChallenge)
├── lib/          Pure, framework-free logic (scoring, storage) — heavily unit-tested
├── data/         Static scenario definitions (no backend)
├── types/        Shared domain types
└── test/         Test setup
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for where it could go next.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues and ideas are very welcome — this app is meant
to grow.

## License

[MIT](LICENSE)
