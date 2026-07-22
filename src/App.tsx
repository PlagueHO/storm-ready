import { useChallenge } from './hooks/useChallenge';
import { ScenarioPicker } from './components/ScenarioPicker';
import { ChallengeScreen } from './features/challenge/ChallengeScreen';
import { ResultsScreen } from './features/challenge/ResultsScreen';
import './App.css';

/** Top-level app shell that routes between the three game phases. */
export function App() {
  const challenge = useChallenge();

  return (
    <div className="app">
      <header className="app__masthead">
        <h1 className="app__title">
          StormReady <span aria-hidden="true">⛈️</span>
        </h1>
        <p className="app__slogan">Beat the storm before it hits.</p>
      </header>

      <main className="app__main">
        {challenge.phase === 'picking' && <ScenarioPicker onPick={challenge.start} />}

        {challenge.phase === 'preparing' && challenge.scenario && (
          <ChallengeScreen
            scenario={challenge.scenario}
            completedTaskIds={challenge.completedTaskIds}
            secondsRemaining={challenge.secondsRemaining}
            score={challenge.score}
            onToggleTask={challenge.toggleTask}
            onFinish={challenge.finish}
            onQuit={challenge.reset}
          />
        )}

        {challenge.phase === 'results' && challenge.scenario && challenge.outcome && (
          <ResultsScreen
            scenario={challenge.scenario}
            outcome={challenge.outcome}
            bestScore={challenge.bestScore}
            isNewRecord={challenge.isNewRecord}
            onPlayAgain={() => challenge.start(challenge.scenario!)}
            onChooseAnother={challenge.reset}
          />
        )}
      </main>

      <footer className="app__footer">
        <span>Local demo · no data leaves your browser</span>
      </footer>
    </div>
  );
}
