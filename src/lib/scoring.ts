import type { PrepTask, ResilienceGrade, Scenario, StormOutcome, TaskResult } from '../types';

/**
 * Pure scoring logic for the StormReady challenge.
 *
 * These functions have no side effects and no framework dependencies, which
 * keeps the game rules trivial to unit test and safe to reuse anywhere.
 */

/** Multiplier applied to task points for each step of a consecutive-check streak. */
export const COMBO_STEPS = [1.0, 1.25, 1.5, 1.75, 2.0] as const;

/** Maximum index into COMBO_STEPS (i.e. the highest combo tier). */
export const MAX_COMBO_STEP = COMBO_STEPS.length - 1;

/**
 * Return the combo multiplier for a given streak length.
 * A streak of 1 (first correct in a row) returns 1.0.
 * Each additional consecutive correct answer steps up the table, capped at 2.0.
 */
export function comboMultiplierForStreak(streak: number): number {
  if (streak <= 0) return 1.0;
  const stepIndex = Math.min(streak - 1, MAX_COMBO_STEP);
  return COMBO_STEPS[stepIndex];
}

/**
 * Apply a combo multiplier to base task points.
 * The result is rounded to the nearest integer.
 */
export function applyCombo(basePoints: number, streak: number): number {
  return Math.round(basePoints * comboMultiplierForStreak(streak));
}

/**
 * Compute a speed bonus based on how much time is left when the player
 * finishes the challenge.  Finishing in the first half of the allotted
 * time earns a large bonus; using 25-50% of the time earns a smaller one.
 */
export function computeSpeedBonus(secondsRemaining: number, totalSeconds: number): number {
  if (totalSeconds <= 0 || secondsRemaining <= 0) return 0;
  const ratio = secondsRemaining / totalSeconds;
  if (ratio >= 0.5) return 15;
  if (ratio >= 0.25) return 7;
  return 0;
}

/** Sum of every task's points for a scenario. Used as the scoring denominator. */
export function maxPoints(tasks: readonly PrepTask[]): number {
  return tasks.reduce((total, task) => total + task.points, 0);
}

/**
 * Compute the resilience score (0-100) from the set of completed task ids.
 * Unknown ids are ignored so stale state can never inflate the score.
 */
export function computeResilienceScore(
  tasks: readonly PrepTask[],
  completedTaskIds: ReadonlySet<string>,
): number {
  const total = maxPoints(tasks);
  if (total === 0) {
    return 0;
  }

  const earned = tasks
    .filter((task) => completedTaskIds.has(task.id))
    .reduce((sum, task) => sum + task.points, 0);

  return Math.round((earned / total) * 100);
}

/** Map a resilience score to a letter grade. */
export function gradeForScore(score: number): ResilienceGrade {
  if (score >= 85) {
    return 'A';
  }
  if (score >= 65) {
    return 'B';
  }
  if (score >= 40) {
    return 'C';
  }
  return 'D';
}

const GRADE_COPY: Record<ResilienceGrade, { headline: string; message: string }> = {
  A: {
    headline: 'Storm-ready champion!',
    message: 'Your home rode out the storm with barely a scratch. Outstanding preparation.',
  },
  B: {
    headline: 'Well prepared',
    message: 'A few gaps remained, but your home came through the storm in good shape.',
  },
  C: {
    headline: 'Partly prepared',
    message: 'You covered the basics, but the storm found some weak spots. Room to improve.',
  },
  D: {
    headline: 'Caught off guard',
    message: 'The storm hit hard. Next time, tackle the high-value tasks first.',
  },
};

/**
 * Award playful badges based on how the player prepared.
 * Badges are purely cosmetic rewards that make results shareable and fun.
 *
 * @param bestStreak  Longest consecutive task streak the player achieved.
 * @param speedBonus  Speed bonus earned (> 0 means the player finished early).
 */
export function earnedBadges(
  scenario: Scenario,
  completedTaskIds: ReadonlySet<string>,
  secondsRemaining: number,
  bestStreak = 0,
  speedBonus = 0,
): readonly string[] {
  const badges: string[] = [];
  const completedCount = scenario.tasks.filter((task) => completedTaskIds.has(task.id)).length;

  if (completedCount === scenario.tasks.length) {
    badges.push('🏆 Completionist');
  }
  if (secondsRemaining >= scenario.durationSeconds / 2 && completedCount > 0) {
    badges.push('⚡ Quick Responder');
  }
  if (scenario.tasks.some((task) => task.category === 'people' && completedTaskIds.has(task.id))) {
    badges.push('❤️ Good Neighbour');
  }
  if (completedCount === 0) {
    badges.push('😬 Better Luck Next Time');
  }
  // Streak-based badges
  if (completedCount > 0 && completedCount === scenario.tasks.length && bestStreak === scenario.tasks.length) {
    badges.push('🔥 Flawless Run');
  }
  if (speedBonus > 0) {
    badges.push('⚡ Lightning Reflexes');
  }

  return badges;
}

/** Build the full storm outcome shown on the results screen. */
export function computeOutcome(
  scenario: Scenario,
  completedTaskIds: ReadonlySet<string>,
  secondsRemaining: number,
  bestStreak = 0,
  taskComboMap: ReadonlyMap<string, number> = new Map(),
): StormOutcome {
  const score = computeResilienceScore(scenario.tasks, completedTaskIds);
  const grade = gradeForScore(score);
  const copy = GRADE_COPY[grade];
  const speedBonus = computeSpeedBonus(secondsRemaining, scenario.durationSeconds);

  const taskBreakdown: TaskResult[] = scenario.tasks.map((task) => {
    const wasCompleted = completedTaskIds.has(task.id);
    const comboMultiplier = wasCompleted ? (taskComboMap.get(task.id) ?? 1.0) : 1.0;
    const earnedPoints = wasCompleted ? Math.round(task.points * comboMultiplier) : 0;
    return {
      taskId: task.id,
      taskLabel: task.label,
      wasCompleted,
      basePoints: task.points,
      earnedPoints,
      comboMultiplier,
    };
  });

  const comboScore =
    taskBreakdown.reduce((sum, t) => sum + t.earnedPoints, 0) + speedBonus;

  return {
    score,
    grade,
    damagePrevented: score,
    headline: copy.headline,
    message: copy.message,
    badges: earnedBadges(scenario, completedTaskIds, secondsRemaining, bestStreak, speedBonus),
    bestStreak,
    speedBonus,
    comboScore,
    taskBreakdown,
  };
}
