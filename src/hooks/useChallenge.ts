import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChallengePhase, Scenario, StormOutcome } from '../types';
import { computeOutcome, computeResilienceScore } from '../lib/scoring';
import { getBestScore, saveBestScore } from '../lib/storage';

interface UseChallenge {
  readonly phase: ChallengePhase;
  readonly scenario: Scenario | null;
  readonly completedTaskIds: ReadonlySet<string>;
  readonly secondsRemaining: number;
  readonly score: number;
  readonly outcome: StormOutcome | null;
  readonly bestScore: number;
  readonly isNewRecord: boolean;
  start: (scenario: Scenario) => void;
  toggleTask: (taskId: string) => void;
  finish: () => void;
  reset: () => void;
}

/**
 * Owns the full lifecycle of a single storm challenge: scenario selection,
 * the countdown timer, task completion, live scoring and the final outcome.
 *
 * All game rules live in pure helpers (see lib/scoring); this hook only wires
 * them to React state and the countdown effect.
 */
export function useChallenge(): UseChallenge {
  const [phase, setPhase] = useState<ChallengePhase>('picking');
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [outcome, setOutcome] = useState<StormOutcome | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const start = useCallback((next: Scenario) => {
    setScenario(next);
    setCompletedTaskIds(new Set());
    setSecondsRemaining(next.durationSeconds);
    setOutcome(null);
    setIsNewRecord(false);
    setPhase('preparing');
  }, []);

  const toggleTask = useCallback(
    (taskId: string) => {
      if (phase !== 'preparing') {
        return;
      }
      setCompletedTaskIds((current) => {
        const next = new Set(current);
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
        return next;
      });
    },
    [phase],
  );

  const finish = useCallback(() => {
    if (!scenario) {
      return;
    }
    const result = computeOutcome(scenario, completedTaskIds, secondsRemaining);
    const previousBest = getBestScore(scenario.id);
    saveBestScore(scenario.id, result.score);
    setIsNewRecord(result.score > previousBest);
    setOutcome(result);
    setPhase('results');
  }, [scenario, completedTaskIds, secondsRemaining]);

  const reset = useCallback(() => {
    setPhase('picking');
    setScenario(null);
    setCompletedTaskIds(new Set());
    setSecondsRemaining(0);
    setOutcome(null);
    setIsNewRecord(false);
  }, []);

  // Drive the countdown while preparing; when it reaches zero, the storm hits.
  useEffect(() => {
    if (phase !== 'preparing') {
      return;
    }
    if (secondsRemaining <= 0) {
      finish();
      return;
    }
    const timer = window.setTimeout(() => setSecondsRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, secondsRemaining, finish]);

  const score = useMemo(
    () => (scenario ? computeResilienceScore(scenario.tasks, completedTaskIds) : 0),
    [scenario, completedTaskIds],
  );

  const bestScore = scenario ? getBestScore(scenario.id) : 0;

  return {
    phase,
    scenario,
    completedTaskIds,
    secondsRemaining,
    score,
    outcome,
    bestScore,
    isNewRecord,
    start,
    toggleTask,
    finish,
    reset,
  };
}
