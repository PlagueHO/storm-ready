import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PrepTask } from '../../types';
import { FloodEscapeGame } from './FloodEscapeGame';

const tasks: readonly PrepTask[] = [
  { id: 'kit', label: 'Grab the go-bag', description: '', category: 'supplies', points: 20 },
  { id: 'valuables', label: 'Move valuables', description: '', category: 'home', points: 15 },
  { id: 'power', label: 'Switch off power', description: '', category: 'home', points: 15 },
  { id: 'drain', label: 'Clear the drain', description: '', category: 'outdoor', points: 10 },
  { id: 'sandbags', label: 'Place sandbags', description: '', category: 'outdoor', points: 20 },
  { id: 'route', label: 'Choose a safe route', description: '', category: 'people', points: 20 },
];

function renderGame(overrides?: Partial<React.ComponentProps<typeof FloodEscapeGame>>) {
  const props: React.ComponentProps<typeof FloodEscapeGame> = {
    tasks,
    completedTaskIds: new Set(),
    secondsRemaining: 45,
    totalSeconds: 45,
    onCompleteTask: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  };

  render(<FloodEscapeGame {...props} />);
  return props;
}

function PlayableGame({ onFinish }: { onFinish: () => void }) {
  const [completedTaskIds, setCompletedTaskIds] = useState<ReadonlySet<string>>(new Set());

  return (
    <FloodEscapeGame
      tasks={tasks}
      completedTaskIds={completedTaskIds}
      secondsRemaining={45}
      totalSeconds={45}
      onCompleteTask={(taskId) => {
        setCompletedTaskIds((current) => new Set(current).add(taskId));
      }}
      onFinish={onFinish}
    />
  );
}

describe('FloodEscapeGame', () => {
  it('collects a safety action when the player moves onto it with the keyboard', () => {
    const props = renderGame();

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(props.onCompleteTask).toHaveBeenCalledWith('kit');
    expect(screen.getByText(/completed: grab the go-bag/i)).toBeInTheDocument();
  });

  it('blocks movement into floodwater and teaches the safety rule', async () => {
    const user = userEvent.setup();
    const props = renderGame();

    await user.click(screen.getByRole('button', { name: /move right/i }));
    await user.click(screen.getByRole('button', { name: /move right/i }));

    expect(props.onCompleteTask).not.toHaveBeenCalled();
    expect(screen.getByText(/never walk or drive through floodwater/i)).toBeInTheDocument();
  });

  it('provides a safe, solvable route through every action to high ground', () => {
    const onFinish = vi.fn();
    const route = 'UURRURRRUUUDDDRDUURRUU';
    const keyForStep: Record<string, string> = {
      U: 'ArrowUp',
      D: 'ArrowDown',
      L: 'ArrowLeft',
      R: 'ArrowRight',
    };
    render(<PlayableGame onFinish={onFinish} />);

    for (const step of route) {
      fireEvent.keyDown(window, { key: keyForStep[step] });
    }

    expect(screen.getByText('6/6')).toBeInTheDocument();
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
