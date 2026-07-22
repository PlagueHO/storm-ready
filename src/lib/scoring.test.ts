import { describe, expect, it } from 'vitest';
import type { PrepTask, Scenario } from '../types';
import {
  applyCombo,
  comboMultiplierForStreak,
  computeOutcome,
  computeResilienceScore,
  computeSpeedBonus,
  earnedBadges,
  gradeForScore,
  maxPoints,
} from './scoring';

const tasks: readonly PrepTask[] = [
  { id: 'a', label: 'A', description: '', category: 'home', points: 30 },
  { id: 'b', label: 'B', description: '', category: 'people', points: 50 },
  { id: 'c', label: 'C', description: '', category: 'outdoor', points: 20 },
];

const scenario: Scenario = {
  id: 'test',
  type: 'flood',
  name: 'Test Storm',
  tagline: '',
  emoji: '🌊',
  durationSeconds: 40,
  tasks,
};

describe('maxPoints', () => {
  it('sums the points of every task', () => {
    expect(maxPoints(tasks)).toBe(100);
  });

  it('returns 0 for an empty task list', () => {
    expect(maxPoints([])).toBe(0);
  });
});

describe('computeResilienceScore', () => {
  it('returns 0 when nothing is completed', () => {
    expect(computeResilienceScore(tasks, new Set())).toBe(0);
  });

  it('returns 100 when every task is completed', () => {
    expect(computeResilienceScore(tasks, new Set(['a', 'b', 'c']))).toBe(100);
  });

  it('weights the score by task points, not task count', () => {
    expect(computeResilienceScore(tasks, new Set(['b']))).toBe(50);
  });

  it('ignores unknown task ids so stale state cannot inflate the score', () => {
    expect(computeResilienceScore(tasks, new Set(['a', 'ghost']))).toBe(30);
  });

  it('guards against division by zero for an empty scenario', () => {
    expect(computeResilienceScore([], new Set(['a']))).toBe(0);
  });
});

describe('gradeForScore', () => {
  it.each([
    [100, 'A'],
    [85, 'A'],
    [84, 'B'],
    [65, 'B'],
    [40, 'C'],
    [39, 'D'],
    [0, 'D'],
  ])('maps score %i to grade %s', (score, grade) => {
    expect(gradeForScore(score)).toBe(grade);
  });
});

describe('comboMultiplierForStreak', () => {
  it('returns 1.0 for a streak of 0', () => {
    expect(comboMultiplierForStreak(0)).toBe(1.0);
  });

  it('returns 1.0 for a streak of 1 (first correct)', () => {
    expect(comboMultiplierForStreak(1)).toBe(1.0);
  });

  it('returns 1.25 for a streak of 2', () => {
    expect(comboMultiplierForStreak(2)).toBe(1.25);
  });

  it('returns 1.5 for a streak of 3', () => {
    expect(comboMultiplierForStreak(3)).toBe(1.5);
  });

  it('returns 1.75 for a streak of 4', () => {
    expect(comboMultiplierForStreak(4)).toBe(1.75);
  });

  it('caps at 2.0 for streaks of 5 and beyond', () => {
    expect(comboMultiplierForStreak(5)).toBe(2.0);
    expect(comboMultiplierForStreak(10)).toBe(2.0);
  });
});

describe('applyCombo', () => {
  it('returns base points unchanged for streak 1', () => {
    expect(applyCombo(100, 1)).toBe(100);
  });

  it('applies 1.25× for a streak of 2', () => {
    expect(applyCombo(100, 2)).toBe(125);
  });

  it('applies 2.0× for a streak of 5', () => {
    expect(applyCombo(50, 5)).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    expect(applyCombo(10, 2)).toBe(13); // 10 * 1.25 = 12.5 → 13
  });
});

describe('computeSpeedBonus', () => {
  it('returns 15 when at least half the time remains', () => {
    expect(computeSpeedBonus(20, 40)).toBe(15);
  });

  it('returns 7 when at least a quarter of the time remains', () => {
    expect(computeSpeedBonus(10, 40)).toBe(7);
  });

  it('returns 0 when less than a quarter of the time remains', () => {
    expect(computeSpeedBonus(5, 40)).toBe(0);
  });

  it('returns 0 when no time remains', () => {
    expect(computeSpeedBonus(0, 40)).toBe(0);
  });

  it('returns 0 when totalSeconds is 0 to avoid division by zero', () => {
    expect(computeSpeedBonus(10, 0)).toBe(0);
  });
});

describe('earnedBadges', () => {
  it('awards the completionist badge for finishing everything', () => {
    const badges = earnedBadges(scenario, new Set(['a', 'b', 'c']), 0);
    expect(badges).toContain('🏆 Completionist');
  });

  it('awards a good-neighbour badge for a completed people task', () => {
    const badges = earnedBadges(scenario, new Set(['b']), 5);
    expect(badges).toContain('❤️ Good Neighbour');
  });

  it('awards the quick responder badge when finishing early', () => {
    const badges = earnedBadges(scenario, new Set(['a']), 30);
    expect(badges).toContain('⚡ Quick Responder');
  });

  it('nudges the player when nothing was done', () => {
    const badges = earnedBadges(scenario, new Set(), 20);
    expect(badges).toContain('😬 Better Luck Next Time');
  });

  it('awards 🔥 Flawless Run when all tasks done in a single streak', () => {
    const badges = earnedBadges(scenario, new Set(['a', 'b', 'c']), 0, 3);
    expect(badges).toContain('🔥 Flawless Run');
  });

  it('does not award 🔥 Flawless Run when streak is less than all tasks', () => {
    const badges = earnedBadges(scenario, new Set(['a', 'b', 'c']), 0, 2);
    expect(badges).not.toContain('🔥 Flawless Run');
  });

  it('awards ⚡ Lightning Reflexes when a speed bonus was earned', () => {
    const badges = earnedBadges(scenario, new Set(['a']), 30, 0, 15);
    expect(badges).toContain('⚡ Lightning Reflexes');
  });
});

describe('computeOutcome', () => {
  it('produces a coherent outcome for a perfect run', () => {
    const outcome = computeOutcome(scenario, new Set(['a', 'b', 'c']), 10);
    expect(outcome.score).toBe(100);
    expect(outcome.grade).toBe('A');
    expect(outcome.damagePrevented).toBe(100);
    expect(outcome.badges).toContain('🏆 Completionist');
  });

  it('produces a low grade for an unprepared run', () => {
    const outcome = computeOutcome(scenario, new Set(), 40);
    expect(outcome.score).toBe(0);
    expect(outcome.grade).toBe('D');
  });

  it('includes bestStreak in the outcome', () => {
    const outcome = computeOutcome(scenario, new Set(['a', 'b']), 5, 2);
    expect(outcome.bestStreak).toBe(2);
  });

  it('computes per-task breakdown correctly', () => {
    const comboMap = new Map([['a', 1.5]]);
    const outcome = computeOutcome(scenario, new Set(['a']), 0, 3, comboMap);
    const taskA = outcome.taskBreakdown.find((t) => t.taskId === 'a');
    const taskB = outcome.taskBreakdown.find((t) => t.taskId === 'b');
    expect(taskA?.wasCompleted).toBe(true);
    expect(taskA?.comboMultiplier).toBe(1.5);
    expect(taskA?.earnedPoints).toBe(45); // 30 * 1.5
    expect(taskB?.wasCompleted).toBe(false);
    expect(taskB?.earnedPoints).toBe(0);
  });

  it('includes speedBonus when finishing early', () => {
    const outcome = computeOutcome(scenario, new Set(['a']), 30); // 30/40 = 75% remaining → 15 bonus
    expect(outcome.speedBonus).toBe(15);
  });

  it('computes comboScore as sum of earnedPoints plus speedBonus', () => {
    const comboMap = new Map([['a', 1.5]]);
    const outcome = computeOutcome(scenario, new Set(['a']), 30, 3, comboMap);
    // earnedPoints for 'a' = 30 * 1.5 = 45, speedBonus = 15
    expect(outcome.comboScore).toBe(60);
  });
});
