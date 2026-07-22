import { describe, expect, it } from 'vitest';
import type { PrepTask, Scenario } from '../types';
import {
  computeOutcome,
  computeResilienceScore,
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
});
