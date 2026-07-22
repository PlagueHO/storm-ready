import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

describe('App', () => {
  it('shows the storm picker on first load', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /choose your storm/i })).toBeInTheDocument();
  });

  it('starts a challenge when a scenario is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /flash flood warning/i }));

    expect(screen.getByRole('heading', { name: /flash flood warning/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /race to high ground/i })).toBeInTheDocument();
    expect(screen.getByRole('application', { name: /flood evacuation map/i })).toBeInTheDocument();
    expect(screen.getByText(/use arrow keys, WASD or the controls/i)).toBeInTheDocument();
  });
});
