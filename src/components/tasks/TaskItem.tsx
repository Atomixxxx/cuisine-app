import React, { useState, useRef, useCallback } from 'react';
import { cn, vibrate, formatDate } from '../../utils';
import {
  CATEGORIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  type Task,
} from '../../types';

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

const TaskItemComponent: React.FC<TaskItemProps> = ({ task, onToggle, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!swiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
      setIsSwiping(true);
    }

    if (swiping.current) {
      e.preventDefault();
      const clamped = Math.max(-100, Math.min(0, dx));
      setSwipeX(clamped);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeX < -60) {
      setSwipeX(-100);
    } else {
      setSwipeX(0);
    }
    swiping.current = false;
    setIsSwiping(false);
  }, [swipeX]);

  const handleToggle = useCallback(() => {
    if (!task.completed) {
      vibrate(30);
      setCompleting(true);
      setTimeout(() => {
        onToggle(task);
        setCompleting(false);
      }, 400);
    } else {
      onToggle(task);
    }
  }, [task, onToggle]);

  const handleTap = useCallback(() => {
    if (!swiping.current && swipeX === 0) {
      setExpanded((p) => !p);
    }
    if (swipeX !== 0) {
      setSwipeX(0);
    }
  }, [swipeX]);

  const priorityColor = PRIORITY_COLORS[task.priority];

  return (
    <div className="relative overflow-hidden rounded-2xl mb-2">
      {/* Delete button behind the card */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end w-[100px] bg-[color:var(--app-danger)] rounded-2xl">
        <button
          onClick={() => onDelete(task.id)}
          className="flex items-center justify-center w-full h-full text-white"
          aria-label="Supprimer"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>

      {/* Card content */}
      <div
        className={cn(
          'relative rounded-2xl app-card transition-all duration-200',
          completing && 'bg-[color:var(--app-success)]/10'
        )}
        style={{ transform: `translateX(${swipeX}px)`, transition: isSwiping ? 'none' : 'transform 0.2s ease-out' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start p-3.5 gap-3" onClick={handleTap}>
          {/* Checkbox - round green iOS style */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className={cn(
              'flex-shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors duration-200',
              task.completed
                ? 'bg-[color:var(--app-success)] border-[color:var(--app-success)]'
                : 'border-[color:var(--app-border)]'
            )}
            aria-label={task.completed ? 'Marquer comme non fait' : 'Marquer comme fait'}
          >
            {(task.completed || completing) && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'ios-body font-medium transition-all duration-200',
                  task.completed
                    ? 'line-through app-muted'
                    : 'app-text'
                )}
              >
                {task.title}
              </span>

              {/* Priority dot */}
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: priorityColor }}
                title={PRIORITY_LABELS[task.priority]}
              />
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Category badge */}
              <span className="inline-block text-[12px] px-2 py-0.5 rounded-full app-surface-2 app-muted">
                {CATEGORIES[task.category]}
              </span>

              {/* Estimated time */}
              {task.estimatedTime != null && task.estimatedTime > 0 && (
                <span className="inline-flex items-center text-[12px] app-muted gap-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {task.estimatedTime} min
                </span>
              )}

              {/* Recurring indicator */}
              {task.recurring && (
                <span className="inline-flex items-center text-[12px] text-[color:var(--app-accent)] gap-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 1l4 4-4 4" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <path d="M7 23l-4-4 4-4" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  {task.recurring === 'daily' ? 'Quotid.' : 'Hebdo.'}
                </span>
              )}
            </div>

            {/* Expanded details */}
            {expanded && (
              <div className="mt-3 pt-3 border-t border-[color:var(--app-border)]/60">
                {task.notes && (
                  <p className="ios-caption app-muted mb-2 whitespace-pre-wrap">
                    {task.notes}
                  </p>
                )}
                <div className="flex items-center gap-2 text-[12px] app-muted">
                  <span>Priorité : {PRIORITY_LABELS[task.priority]}</span>
                  <span>&middot;</span>
                  <span>Créé {formatDate(task.createdAt)}</span>
                </div>
                {task.completedAt && (
                  <div className="text-[12px] app-muted mt-1">
                    Terminé {formatDate(task.completedAt)}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  className="mt-2 ios-caption text-[color:var(--app-accent)] font-semibold active:opacity-70"
                >
                  Modifier
                </button>
              </div>
            )}
          </div>

          {/* Expand indicator */}
          <svg
            className={cn(
              'w-4 h-4 app-muted flex-shrink-0 mt-3 transition-transform duration-200',
              expanded && 'rotate-180'
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </div>
  );
};

const TaskItem = React.memo(
  TaskItemComponent,
  (prevProps, nextProps) =>
    prevProps.task === nextProps.task &&
    prevProps.onToggle === nextProps.onToggle &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onDelete === nextProps.onDelete,
);

export default TaskItem;

