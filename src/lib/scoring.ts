import type { PrepTask, ResilienceGrade, Scenario, StormOutcome } from '../types';

/**
 * Pure scoring logic for the StormReady challenge.
 *
 * These functions have no side effects and no framework dependencies, which
 * keeps the game rules trivial to unit test and safe to reuse anywhere.
 */

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
 */
export function earnedBadges(
  scenario: Scenario,
  completedTaskIds: ReadonlySet<string>,
  secondsRemaining: number,
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

  return badges;
}

/** Build the full storm outcome shown on the results screen. */
export function computeOutcome(
  scenario: Scenario,
  completedTaskIds: ReadonlySet<string>,
  secondsRemaining: number,
): StormOutcome {
  const score = computeResilienceScore(scenario.tasks, completedTaskIds);
  const grade = gradeForScore(score);
  const copy = GRADE_COPY[grade];

  return {
    score,
    grade,
    damagePrevented: score,
    headline: copy.headline,
    message: copy.message,
    badges: earnedBadges(scenario, completedTaskIds, secondsRemaining),
  };
}
