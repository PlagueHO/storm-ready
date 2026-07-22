# Roadmap

StormReady is designed to be extended. This is a menu of ideas — not a commitment — grouped by
theme. Many map to issues in the tracker and make great bite-sized enhancements.

## Gameplay

- Additional storm scenarios (snowstorm, wildfire, king tide, earthquake aftershock).
- Difficulty levels that shorten the timer or add surprise events mid-storm.
- "Damage events" that trigger when key tasks are missed.
- A combo/streak bonus for completing related tasks quickly.

## Visuals & feel

- Animated weather backdrop that intensifies as the countdown runs down.
- Sound effects and haptics (respecting reduced-motion / mute preferences).
- Celebratory animation and confetti on a new personal best.

## Social & sharing

- Shareable results card (image or link).
- A mocked local "neighbourhood leaderboard".

## Accessibility & quality

- Full keyboard navigation audit and focus management between phases.
- `prefers-reduced-motion` support for all animations.
- Internationalisation (i18n) with at least one additional language.

## Intelligence (local-first)

- A **Preparedness Coach** powered by a local LLM via **Foundry Local**: reads the player's
  current board and suggests the highest-impact next task.
- AI-generated dynamic scenarios so no two storms feel the same — still fully local.

## Developer experience

- Playwright end-to-end smoke test of a full challenge run.
- Storybook (or similar) for isolated component development.
- Test coverage thresholds enforced in CI.
