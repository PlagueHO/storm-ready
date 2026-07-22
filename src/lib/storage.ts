/**
 * Local-storage persistence for personal best scores.
 *
 * Wrapped in try/catch so the game keeps working in private-browsing modes or
 * anywhere localStorage is unavailable. No backend required.
 */

const STORAGE_KEY = 'storm-ready:best-scores';

type BestScores = Record<string, number>;

function readAll(): BestScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BestScores) : {};
  } catch {
    return {};
  }
}

/** The player's best score for a scenario, or 0 if none is recorded. */
export function getBestScore(scenarioId: string): number {
  return readAll()[scenarioId] ?? 0;
}

/**
 * Persist a score if it beats the stored best.
 * Returns the resulting best score so callers can react to a new record.
 */
export function saveBestScore(scenarioId: string, score: number): number {
  const scores = readAll();
  const previousBest = scores[scenarioId] ?? 0;
  if (score <= previousBest) {
    return previousBest;
  }

  scores[scenarioId] = score;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Ignore write failures - a missing high score should never break play.
  }
  return score;
}
