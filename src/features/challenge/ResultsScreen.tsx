import { useState } from 'react';
import type { Scenario, StormOutcome } from '../../types';

interface ResultsScreenProps {
  scenario: Scenario;
  outcome: StormOutcome;
  bestScore: number;
  isNewRecord: boolean;
  onPlayAgain: () => void;
  onChooseAnother: () => void;
}

/** Build a plain-text summary suitable for copying to the clipboard. */
function buildShareText(scenario: Scenario, outcome: StormOutcome): string {
  const streakLine = outcome.bestStreak > 0 ? `Best streak: ${outcome.bestStreak} in a row` : '';
  const speedLine = outcome.speedBonus > 0 ? `Speed bonus: +${outcome.speedBonus} pts` : '';
  const extras = [streakLine, speedLine].filter(Boolean).join(' · ');

  const lines = [
    `⛈️ StormReady — ${scenario.name}`,
    `Grade: ${outcome.grade} · Score: ${outcome.score}/100`,
    ...(outcome.comboScore !== outcome.score ? [`Combo score: ${outcome.comboScore} pts`] : []),
    ...(extras ? [extras] : []),
    `"${outcome.headline}"`,
    '',
    'Can you beat my score? https://storm-ready.app',
  ];

  return lines.join('\n');
}

/** The recap screen shown once the storm hits: grade, badges and next steps. */
export function ResultsScreen({
  scenario,
  outcome,
  bestScore,
  isNewRecord,
  onPlayAgain,
  onChooseAnother,
}: ResultsScreenProps) {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleShare = async () => {
    const text = buildShareText(scenario, outcome);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // Graceful fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2500);
    } catch {
      setShareState('error');
      setTimeout(() => setShareState('idle'), 2500);
    }
  };

  return (
    <section className="results" aria-labelledby="results-heading">
      {/* Grade hero */}
      <div className={`results__grade results__grade--${outcome.grade.toLowerCase()}`}>
        {outcome.grade}
      </div>
      <h2 id="results-heading" className="results__headline">
        {outcome.headline}
      </h2>
      <p className="results__message">{outcome.message}</p>

      {/* Key stats */}
      <dl className="results__stats">
        <div>
          <dt>Resilience score</dt>
          <dd>{outcome.score}</dd>
        </div>
        <div>
          <dt>Damage prevented</dt>
          <dd>{outcome.damagePrevented}%</dd>
        </div>
        {outcome.comboScore !== outcome.score && (
          <div>
            <dt>Combo score</dt>
            <dd>{outcome.comboScore}</dd>
          </div>
        )}
        <div>
          <dt>Personal best</dt>
          <dd>{bestScore}</dd>
        </div>
      </dl>

      {/* Streak & speed bonus */}
      {(outcome.bestStreak > 0 || outcome.speedBonus > 0) && (
        <div className="results__bonuses">
          {outcome.bestStreak > 0 && (
            <div className="results__bonus-pill results__bonus-pill--streak">
              <span aria-hidden="true">🔥</span>
              <span>Best streak: <strong>{outcome.bestStreak}</strong> in a row</span>
            </div>
          )}
          {outcome.speedBonus > 0 && (
            <div className="results__bonus-pill results__bonus-pill--speed">
              <span aria-hidden="true">⚡</span>
              <span>Speed bonus: <strong>+{outcome.speedBonus} pts</strong></span>
            </div>
          )}
        </div>
      )}

      {isNewRecord ? <p className="results__record">🎉 New personal best!</p> : null}

      {/* Badges */}
      {outcome.badges.length > 0 ? (
        <ul className="results__badges">
          {outcome.badges.map((badge) => (
            <li key={badge} className="badge">
              {badge}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Per-task breakdown */}
      <div className="results__breakdown">
        <h3 className="results__breakdown-heading">Task breakdown</h3>
        <ul className="results__breakdown-list">
          {outcome.taskBreakdown.map((task) => (
            <li
              key={task.taskId}
              className={`results__breakdown-item${task.wasCompleted ? ' results__breakdown-item--done' : ''}`}
            >
              <span className="results__breakdown-icon" aria-hidden="true">
                {task.wasCompleted ? '✅' : '❌'}
              </span>
              <span className="results__breakdown-label">{task.taskLabel}</span>
              <span className="results__breakdown-meta">
                {task.wasCompleted ? (
                  <>
                    <span className="results__breakdown-pts">+{task.earnedPoints} pts</span>
                    {task.comboMultiplier > 1.0 && (
                      <span className="results__breakdown-combo">×{task.comboMultiplier.toFixed(2)}</span>
                    )}
                  </>
                ) : (
                  <span className="results__breakdown-pts results__breakdown-pts--missed">
                    {task.basePoints} pts missed
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="results__actions">
        <button type="button" className="button button--ghost" onClick={onChooseAnother}>
          Choose another storm
        </button>
        <button
          type="button"
          className="button button--share"
          onClick={handleShare}
          aria-live="polite"
        >
          {shareState === 'copied'
            ? '✅ Copied!'
            : shareState === 'error'
              ? '⚠️ Copy failed'
              : '📋 Share result'}
        </button>
        <button type="button" className="button button--primary" onClick={onPlayAgain}>
          Play {scenario.name} again
        </button>
      </footer>
    </section>
  );
}

