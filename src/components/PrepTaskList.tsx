import type { PrepTask } from '../types';

interface PrepTaskListProps {
  tasks: readonly PrepTask[];
  completedTaskIds: ReadonlySet<string>;
  onToggle: (taskId: string) => void;
}

/** The interactive checklist of preparation actions. */
export function PrepTaskList({ tasks, completedTaskIds, onToggle }: PrepTaskListProps) {
  return (
    <ul className="tasks">
      {tasks.map((task) => {
        const done = completedTaskIds.has(task.id);
        return (
          <li key={task.id}>
            <button
              type="button"
              className={`task${done ? ' task--done' : ''}`}
              aria-pressed={done}
              onClick={() => onToggle(task.id)}
            >
              <span className="task__check" aria-hidden="true">
                {done ? '✓' : ''}
              </span>
              <span className="task__body">
                <span className="task__label">{task.label}</span>
                <span className="task__description">{task.description}</span>
              </span>
              <span className="task__points">+{task.points}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
