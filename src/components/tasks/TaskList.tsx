import React, { useState, useMemo } from 'react';
import { CATEGORIES, type Task, type TaskCategory } from '../../types';
import { cn } from '../../utils';
import TaskItem from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  grouped: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

const TaskList: React.FC<TaskListProps> = ({ tasks, grouped, onToggle, onEdit, onDelete }) => {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.completed),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.completed),
    [tasks]
  );

  const sortedActive = useMemo(() => {
    return [...activeTasks].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [activeTasks]);

  const groupedTasks = useMemo(() => {
    if (!grouped) return null;
    const groups: Record<TaskCategory, Task[]> = {} as Record<TaskCategory, Task[]>;
    for (const t of sortedActive) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    return groups;
  }, [grouped, sortedActive]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg
          className="w-16 h-16 text-[#d1d1d6] dark:text-[#38383a] mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <p className="ios-title3 text-[#86868b]">
          Aucune tâche
        </p>
        <p className="text-[15px] text-[#86868b] mt-1">
          Appuyez sur + pour ajouter une tâche
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Active tasks */}
      {grouped && groupedTasks ? (
        Object.entries(groupedTasks).map(([cat, catTasks]) => {
          const isCollapsed = collapsedCategories.has(cat);
          return (
            <div key={cat} className="mb-3">
              <button
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-2 w-full py-2 px-1 text-left"
              >
                <svg
                  className={cn(
                    'w-4 h-4 text-[#86868b] transition-transform duration-200',
                    isCollapsed && '-rotate-90'
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
                <span className="ios-caption-upper text-[#86868b]">
                  {CATEGORIES[cat as TaskCategory]}
                </span>
                <span className="text-[12px] text-[#86868b]">
                  ({catTasks.length})
                </span>
              </button>
              {!isCollapsed && (
                <div>
                  {catTasks.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div>
          {sortedActive.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Completed tasks section */}
      {completedTasks.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowCompleted((p) => !p)}
            className="flex items-center gap-2 w-full py-2 px-1 text-left"
          >
            <svg
              className={cn(
                'w-4 h-4 text-[#86868b] transition-transform duration-200',
                !showCompleted && '-rotate-90'
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
            <span className="ios-caption-upper text-[#86868b]">
              Terminées
            </span>
            <span className="text-[12px] text-[#86868b]">
              ({completedTasks.length})
            </span>
          </button>
          {showCompleted && (
            <div className="opacity-60">
              {completedTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskList;
