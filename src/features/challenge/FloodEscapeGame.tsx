import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PrepTask } from '../../types';

interface FloodEscapeGameProps {
  tasks: readonly PrepTask[];
  completedTaskIds: ReadonlySet<string>;
  secondsRemaining: number;
  totalSeconds: number;
  onCompleteTask: (taskId: string) => void;
  onFinish: () => void;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

interface CollectibleSpot extends Position {
  readonly icon: string;
}

const COLUMNS = 9;
const ROWS = 7;
const START: Position = { x: 0, y: 6 };
const HIGH_GROUND: Position = { x: 8, y: 0 };

const COLLECTIBLE_SPOTS: readonly CollectibleSpot[] = [
  { x: 0, y: 5, icon: '🎒' },
  { x: 2, y: 4, icon: '📦' },
  { x: 4, y: 3, icon: '⚡' },
  { x: 6, y: 4, icon: '🕳️' },
  { x: 8, y: 2, icon: '🧱' },
  { x: 5, y: 0, icon: '🗺️' },
];

const FLOOD_WATER = new Set([
  '2,6',
  '2,5',
  '4,5',
  '6,6',
  '6,5',
  '7,5',
  '8,5',
  '0,3',
  '1,3',
  '3,2',
  '2,1',
]);

const DEBRIS = new Set(['1,5', '3,4', '5,4', '7,3', '1,2', '4,2', '6,1']);

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

const KEY_DIRECTIONS: Readonly<Record<string, Position>> = {
  arrowup: DIRECTIONS.up,
  w: DIRECTIONS.up,
  arrowdown: DIRECTIONS.down,
  s: DIRECTIONS.down,
  arrowleft: DIRECTIONS.left,
  a: DIRECTIONS.left,
  arrowright: DIRECTIONS.right,
  d: DIRECTIONS.right,
};

const PRESSURE_LABELS = [
  'Creek rising',
  'Water spreading',
  'Roads flooding',
  'Current surging',
  'Evacuate now',
];

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function samePosition(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y;
}

/**
 * A flood-only movement challenge. Players collect preparedness actions around
 * the neighbourhood, avoid floodwater and debris, then evacuate to high ground.
 */
export function FloodEscapeGame({
  tasks,
  completedTaskIds,
  secondsRemaining,
  totalSeconds,
  onCompleteTask,
  onFinish,
}: FloodEscapeGameProps) {
  const [player, setPlayer] = useState<Position>(START);
  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState(
    'Grab the go-bag, complete every safety action, then reach high ground.',
  );
  const playerRef = useRef<Position>(START);
  const finishedRef = useRef(false);

  const collectibles = useMemo(
    () =>
      tasks.slice(0, COLLECTIBLE_SPOTS.length).map((task, index) => ({
        task,
        ...COLLECTIBLE_SPOTS[index],
      })),
    [tasks],
  );

  const collectibleByPosition = useMemo(
    () => new Map(collectibles.map((collectible) => [positionKey(collectible), collectible])),
    [collectibles],
  );

  const remainingCount = tasks.filter((task) => !completedTaskIds.has(task.id)).length;
  const elapsedFraction = totalSeconds > 0 ? 1 - secondsRemaining / totalSeconds : 1;
  const pressureLevel = Math.min(
    PRESSURE_LABELS.length - 1,
    Math.floor(elapsedFraction * PRESSURE_LABELS.length),
  );

  const move = useCallback(
    (direction: Position) => {
      if (finishedRef.current) {
        return;
      }

      const target = {
        x: playerRef.current.x + direction.x,
        y: playerRef.current.y + direction.y,
      };
      const targetKey = positionKey(target);

      if (target.x < 0 || target.x >= COLUMNS || target.y < 0 || target.y >= ROWS) {
        setMessage('That route leaves the safe map. Choose another direction.');
        return;
      }
      if (FLOOD_WATER.has(targetKey)) {
        setMessage("Turn around, don't drown. Never walk or drive through floodwater.");
        return;
      }
      if (DEBRIS.has(targetKey)) {
        setMessage('Storm debris blocks that route. Find a safer way around.');
        return;
      }

      playerRef.current = target;
      setPlayer(target);
      setMoves((current) => current + 1);

      const collectible = collectibleByPosition.get(targetKey);
      if (collectible && !completedTaskIds.has(collectible.task.id)) {
        onCompleteTask(collectible.task.id);
        setMessage(`Completed: ${collectible.task.label}. Keep moving.`);
        return;
      }

      if (samePosition(target, HIGH_GROUND)) {
        if (remainingCount === 0) {
          finishedRef.current = true;
          setMessage('High ground reached. You evacuated safely!');
          onFinish();
        } else {
          setMessage(
            `High ground is close, but ${remainingCount} safety ${remainingCount === 1 ? 'action remains' : 'actions remain'}.`,
          );
        }
        return;
      }

      setMessage('Keep moving. Floodwater can rise without warning.');
    },
    [collectibleByPosition, completedTaskIds, onCompleteTask, onFinish, remainingCount],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.key.toLowerCase()];
      if (!direction) {
        return;
      }
      event.preventDefault();
      move(direction);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  return (
    <div className={`flood-game flood-game--pressure-${pressureLevel}`}>
      <div className="flood-game__briefing">
        <div>
          <span className="flood-game__eyebrow">Interactive mission</span>
          <h3>Race to high ground</h3>
          <p>
            Use arrow keys, WASD or the controls. Collect all six safety actions and avoid moving
            water.
          </p>
        </div>
        <dl className="flood-game__mission-stats">
          <div>
            <dt>Actions</dt>
            <dd>
              {tasks.length - remainingCount}/{tasks.length}
            </dd>
          </div>
          <div>
            <dt>Moves</dt>
            <dd>{moves}</dd>
          </div>
        </dl>
      </div>

      <div className="flood-game__map-panel">
        <div
          className="flood-game__board"
          role="application"
          aria-label="Flood evacuation map. Use arrow keys or WASD to move."
          tabIndex={0}
        >
          {Array.from({ length: ROWS }, (_, y) =>
            Array.from({ length: COLUMNS }, (_, x) => {
              const position = { x, y };
              const key = positionKey(position);
              const collectible = collectibleByPosition.get(key);
              const isCollected = collectible ? completedTaskIds.has(collectible.task.id) : false;
              const isPlayer = samePosition(position, player);
              const isHighGround = samePosition(position, HIGH_GROUND);
              const classes = [
                'flood-game__cell',
                FLOOD_WATER.has(key) ? 'flood-game__cell--water' : '',
                DEBRIS.has(key) ? 'flood-game__cell--debris' : '',
                isHighGround ? 'flood-game__cell--high-ground' : '',
                collectible && !isCollected ? 'flood-game__cell--collectible' : '',
                isCollected ? 'flood-game__cell--collected' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div className={classes} key={key} aria-hidden="true">
                  {isPlayer ? (
                    <span className="flood-game__player">🏃</span>
                  ) : isHighGround ? (
                    <span className="flood-game__high-ground">⛰️</span>
                  ) : collectible && !isCollected ? (
                    <span className="flood-game__collectible">{collectible.icon}</span>
                  ) : isCollected ? (
                    <span className="flood-game__collected">✓</span>
                  ) : DEBRIS.has(key) ? (
                    <span className="flood-game__debris">🪵</span>
                  ) : null}
                </div>
              );
            }),
          )}
        </div>

        <p className="flood-game__status" aria-live="polite">
          {message}
        </p>

        <div className="flood-game__controls" aria-label="Movement controls">
          <button
            type="button"
            className="flood-game__control flood-game__control--up"
            onClick={() => move(DIRECTIONS.up)}
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="flood-game__control flood-game__control--left"
            onClick={() => move(DIRECTIONS.left)}
            aria-label="Move left"
          >
            ←
          </button>
          <button
            type="button"
            className="flood-game__control flood-game__control--down"
            onClick={() => move(DIRECTIONS.down)}
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            className="flood-game__control flood-game__control--right"
            onClick={() => move(DIRECTIONS.right)}
            aria-label="Move right"
          >
            →
          </button>
        </div>
      </div>

      <aside className="flood-game__hud" aria-label="Mission progress">
        <div className="flood-game__pressure">
          <div className="flood-game__pressure-heading">
            <span>Flood pressure</span>
            <strong>{PRESSURE_LABELS[pressureLevel]}</strong>
          </div>
          <div className="flood-game__pressure-bars" aria-hidden="true">
            {PRESSURE_LABELS.map((label, index) => (
              <span className={index <= pressureLevel ? 'is-active' : ''} key={label} />
            ))}
          </div>
        </div>

        <ul className="flood-game__tasks">
          {collectibles.map((collectible) => {
            const done = completedTaskIds.has(collectible.task.id);
            return (
              <li
                className={done ? 'flood-game__task flood-game__task--done' : 'flood-game__task'}
                key={collectible.task.id}
              >
                <span aria-hidden="true">{done ? '✓' : collectible.icon}</span>
                <span>{collectible.task.label}</span>
              </li>
            );
          })}
        </ul>

        <div className="flood-game__legend">
          <span>🌊 Floodwater</span>
          <span>🪵 Debris</span>
          <span>⛰️ High ground</span>
        </div>
      </aside>
    </div>
  );
}
