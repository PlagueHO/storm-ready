# Storm Ready Challenge — Workshop Demo Runbook

**Audience:** Tower Insurance (New Zealand)
**Session:** Introduction to GitHub Copilot & the Evolution of Agentic Software Development
**Duration:** ~90 minutes
**Presenters:** Daniel (DAS) & Ricky (RIC)
**Demo app / repo:** [`PlagueHO/storm-ready`](https://github.com/PlagueHO/storm-ready) — a gamified, front-end-only React storm-preparedness game (no backend, runs 100% locally).

> This document captures the **steps and flow** only — what we click, run, and prompt. It is not a script of what we say. Prompts are provided verbatim so they can be pasted live.

---

## Narrative arc (the spine of the session)

| # | Segment | Headline | Capability |
|---|---------|----------|------------|
| 0 | Setup | The starting line | Repo + app orientation |
| 1 | **The familiar space** | Shape your own agentic dev process | VS Code: Completions, Agent Mode, Instructions, Skills, Custom Agents, Subagents |
| 2 | **Terminal velocity** | No IDE required | Copilot CLI: extensibility, marketplace & plugins, voice mode, fleet mode |
| 3 | **No computer? No problem** | Work from anywhere | Coding Agent, Copilot Autofix, Agentic Workflows, GitHub.com |
| 4 | **Organizational knowledge** | Enterprise memory | Copilot Spaces |
| 5 | **Agentic development evolution** | The new way of working | GitHub App: Canvas, Automations, Agent Merge |
| 6 | Close | **Your own Agentic Development Operating System** | Bring it together |

**Ground rule for the whole session:** the repo intentionally ships **no** `.github/copilot-instructions.md`, skills, agents, or chatmodes. We build that scaffolding **live** so the audience sees the "before → after".

---

## Pre-flight checklist (before the audience arrives)

- [ ] Repo cloned locally; `npm install` already run (it's slow — do it beforehand).
- [ ] `npm run dev` works; app opens and a full round can be played.
- [ ] VS Code open at the repo root with the Copilot extensions signed in.
- [ ] Copilot CLI installed and authenticated; voice input tested; mic working.
- [ ] Signed in to GitHub.com as **PlagueHO**; the 11 backlog issues visible.
- [ ] Collaborators **carogao** and **Ricky-G** have accepted their invites.
- [ ] Copilot Space created (or ready to create live in Segment 4).
- [ ] GitHub App (desktop) installed and signed in for Segment 5.
- [ ] Zoom/scale VS Code, terminal, and browser fonts up for readability.
- [ ] Backup: `files/ci.yml.saved` handy if we want to add CI live.

---

## Segment 0 — The starting line (≈5 min) · DAS

**Goal:** orient the audience on the app and prove it runs locally.

1. Show the repo on GitHub.com → README, folder structure, the 11 open issues (our backlog).
2. In VS Code, run the dev server:
   ```bash
   npm run dev
   ```
3. Play one quick round in the browser: pick a scenario → complete prep tasks → hit the results screen (score, grade, badges).
4. Call out the shape of the code (no AI files yet):
   - Pure logic: `src/lib/scoring.ts`
   - Static data: `src/data/scenarios.ts`
   - State machine: `src/hooks/useChallenge.ts`
   - UI: `src/components/*`, `src/features/challenge/*`

---

## Segment 1 — The familiar space: VS Code (≈25 min) · DAS leads, RIC co-drives

**Goal:** show how you shape a personal AI workflow inside the editor you already know.

### 1a. Completions (warm-up)
1. Open `src/data/scenarios.ts`.
2. Start typing a new scenario object and let **inline completions** suggest the fields. Accept + tweak.

### 1b. Agent Mode — build a feature end to end (Issue #1: Snowstorm)
1. Open Copilot Chat → **Agent** mode.
2. Prompt:
   > Implement the Snowstorm scenario described in issue #1. Add a new entry to `src/data/scenarios.ts` with an id of `snowstorm`, a themed name and description, a snow/ice emoji, and 4–6 winter-appropriate prep tasks with sensible point weights so a strong run can still reach an A. Don't change any logic — it should appear in the picker automatically. Run the tests when you're done.
3. Review the diff, accept, show the new storm live in the running app.

### 1c. Custom Instructions — encode team standards
1. Create `.github/copilot-instructions.md` live.
2. Prompt (in Agent mode):
   > Create a `.github/copilot-instructions.md` for this repo. Capture our conventions: TypeScript strict, functional React components with hooks, keep game logic pure and framework-free in `src/lib`, scenarios are data-only in `src/data`, every logic change needs a matching Vitest test, and we follow Clean Code / SOLID / DRY / YAGNI. Keep it concise.
3. Re-run a small request to show the model now follows the house style.

### 1d. Skills — a reusable "add a scenario" capability
1. Prompt:
   > Create a reusable prompt/skill file that documents exactly how to add a new storm scenario to this app end to end — the data shape, where it lives, the point-weighting rule, and the requirement to appear in the picker with no logic changes. Store it under `.github/prompts/` as `add-scenario.prompt.md`.
2. Invoke the new skill to add a second storm (e.g. a **Dust storm**) to show reuse.

### 1e. Custom Agent + Subagents — divide the work (Issue #5: Accessibility)
1. Prompt (Agent mode, referencing the accessibility issue):
   > Work on issue #5. First, add a shared `usePrefersReducedMotion` hook. Then audit the interactive controls for keyboard access and visible focus. Split this into subtasks and tackle them, adding tests where logic is involved. Summarise what changed.
2. Show how the agent decomposes the task and reports back.

**Handoff to RIC:** "We've shaped a workflow in the IDE — but you don't always have the IDE."

---

## Segment 2 — Terminal velocity: Copilot CLI (≈20 min) · RIC leads

**Goal:** the same power, no IDE, plus extensibility, voice, and fleet.

### 2a. First contact
1. In the repo root:
   ```bash
   copilot
   ```
2. Simple grounded prompt:
   > Explain what this repo does and how the scoring works, based on `src/lib/scoring.ts`.

### 2b. Build a feature from the CLI (Issue #4: Confetti on personal best)
1. Prompt:
   > Implement issue #4: celebrate a new personal best. Track the best score per scenario in local storage, and on the results screen show a confetti burst and a "New best!" badge when the player beats it. Respect reduced motion. Add tests for the best-score tracking logic.
2. Review the change set in the terminal; run `npm test`.

### 2c. Extensibility — plugins & marketplace
1. Show adding/using a plugin or MCP extension from the marketplace (e.g. a GitHub or docs tool).
2. Prompt that leverages the extension, e.g.:
   > Using the GitHub tools, list the open issues in this repo and suggest which two are the best "good first issue" demos.

### 2d. Voice mode
1. Enable voice input.
2. Speak a prompt, e.g.:
   > "Add a sound-effects mute toggle from issue #3 — muted by default, and persist the preference."
3. Show it transcribing and executing.

### 2e. Fleet mode
1. Kick off **multiple parallel agents** on independent issues, e.g. Issue #7 (leaderboard) and Issue #8 (difficulty levels):
   > Start one agent on issue #7 (mocked neighbourhood leaderboard) and another on issue #8 (difficulty levels). Keep them independent and report back when each is done.
2. Show them running concurrently and collect the results.

**Handoff to DAS:** "No terminal, no laptop even — let's go fully remote."

---

## Segment 3 — No computer? No problem (≈15 min) · DAS leads, RIC assists

**Goal:** delegate work from GitHub.com itself; let automation fix things.

### 3a. Coding Agent from the browser (Issue #6: Shareable results card)
1. On GitHub.com, open **issue #6**.
2. Assign it to **Copilot** (Coding Agent) with a kickoff instruction:
   > Implement a shareable results card: a "Share" action on the results screen that produces a formatted summary (scenario, score, grade, badges) with copy-to-clipboard, working fully offline. Open a PR when ready.
3. Show the agent working and a PR being opened.

### 3b. Copilot Autofix / Copilot Fix
1. In an open PR, show a failing check or a flagged issue.
2. Trigger **Copilot Autofix** and apply the suggested fix.
   - (Optional) If we add CI live from `files/ci.yml.saved`, use a real failing build here.

### 3c. Agentic Workflows (optional / if time)
1. Show a scheduled or event-driven agentic workflow definition.
2. Explain how recurring maintenance (e.g. dependency bumps, triage) runs itself.

**Handoff to RIC:** "This all gets better when the AI knows *our* organization."

---

## Segment 4 — Organizational knowledge: Copilot Spaces (≈10 min) · RIC leads

**Goal:** ground Copilot in curated, enterprise-specific knowledge.

1. Create (or open) a **Copilot Space** for the workshop / Storm Ready project.
2. Add sources: the `storm-ready` repo, the `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`, and a couple of "policy"-style notes (e.g. brand tone, prep-checklist guidance).
3. Ask a grounded question that spans the curated sources:
   > Based on this space, what's our house architecture for adding features to Storm Ready, and which roadmap items are the best next demos?
4. Contrast with an ungrounded model answer to show the value of curated org knowledge.

**Handoff to DAS:** "Now let's bring it all together in the agentic way of working."

---

## Segment 5 — Agentic development evolution: GitHub App (≈10 min) · DAS leads

**Goal:** the emerging, agent-first way of working — canvas, automations, agent merge.

### 5a. Canvas
1. In the GitHub App, open a **Canvas** for a feature (e.g. Issue #2: animated weather backdrop).
2. Prompt the agent to design/build in the canvas:
   > Implement the animated weather backdrop from issue #2 — a background layer that intensifies as the countdown drops, styled per scenario, purely presentational and respecting reduced motion.
3. Show the interactive, visual working surface.

### 5b. Automations
1. Show an **automation** that triggers agent work on a schedule or event (e.g. auto-triage new issues, or nightly "keep deps current").

### 5c. Agent Merge
1. Take two of the parallel PRs produced earlier (e.g. from fleet mode / coding agent).
2. Use **Agent Merge** to reconcile and merge them cleanly.
3. Pull `main`, run the app, and show the combined result live.

---

## Segment 6 — Close: Your own Agentic Development Operating System (≈5 min) · DAS + RIC

1. Recap the journey on one slide/screen:
   - Familiar IDE → CLI → browser/remote → org knowledge → agent-first.
2. Show the repo now: seeded backlog partially burned down, new features merged, instructions + skills + agents now present (built live during the session).
3. Key message: **you assemble these building blocks into your own agentic development operating system.**
4. Point the audience at the repo and invite them to fork and extend.

---

## Issue → Segment cheat sheet

| Issue | Title | Demoed in |
|-------|-------|-----------|
| #1 | Add a Snowstorm scenario | 1b (Agent Mode) |
| #2 | Animated weather backdrop | 5a (Canvas) |
| #3 | Sound effects + mute toggle | 2d (Voice mode) |
| #4 | Confetti on personal best | 2b (CLI feature build) |
| #5 | prefers-reduced-motion + keyboard nav | 1e (Custom agent + subagents) |
| #6 | Shareable results card | 3a (Coding Agent) |
| #7 | Mocked neighbourhood leaderboard | 2e (Fleet mode) |
| #8 | Difficulty levels + surprises | 2e (Fleet mode) |
| #9 | Preparedness Coach via Foundry Local | Stretch / future (local LLM) |
| #10 | Playwright E2E smoke test | 3b (Autofix, optional) |
| #11 | README screenshots + GIF | Good-first-issue filler |

---

## Timing summary

| Segment | Minutes | Running total |
|---------|---------|---------------|
| 0 — Starting line | 5 | 5 |
| 1 — VS Code | 25 | 30 |
| 2 — Copilot CLI | 20 | 50 |
| 3 — Remote / Autofix | 15 | 65 |
| 4 — Copilot Spaces | 10 | 75 |
| 5 — GitHub App | 10 | 85 |
| 6 — Close | 5 | 90 |

---

## Fallback / safety notes

- If a live build breaks, `git stash` or reset the working tree and move on — the backlog has plenty of independent issues.
- Keep one **known-good** issue (e.g. #1 Snowstorm) as a guaranteed win if a demo stalls.
- CI is intentionally omitted (token lacks `workflow` scope). Add it live from `files/ci.yml.saved` only if we want a real failing check for Autofix.
- Foundry Local (Issue #9) is the flagship "future" story — keep it as a teaser unless the environment is pre-warmed.
