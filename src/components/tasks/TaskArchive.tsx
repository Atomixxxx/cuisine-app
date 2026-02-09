import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CATEGORIES, type Task, type TaskCategory } from '../../types';
import { cn } from '../../utils';
import { TaskItemSkeleton, ListSkeleton } from '../common/Skeleton';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';

interface TaskArchiveProps {
  onClose: () => void;
}

const categoryKeys = Object.keys(CATEGORIES) as TaskCategory[];

const TaskArchive: React.FC<TaskArchiveProps> = ({ onClose }) => {
  const getTasks = useAppStore(s => s.getTasks);
  const updateTask = useAppStore(s => s.updateTask);
  const deleteTask = useAppStore(s => s.deleteTask);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [filterCategory, setFilterCategory] = useState<TaskCategory | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getTasks(true);
      const archived = all.filter((t) => t.archived);
      setArchivedTasks(archived);
    } catch {
      showError('Impossible de charger les archives');
    } finally {
      setLoading(false);
    }
  }, [getTasks]);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  const filteredTasks = useMemo(() => {
    let result = archivedTasks;

    if (filterCategory !== 'all') {
      result = result.filter((t) => t.category === filterCategory);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((t) => new Date(t.createdAt).getTime() >= from.getTime());
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((t) => new Date(t.createdAt).getTime() <= to.getTime());
    }

    return result.sort(
      (a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime()
    );
  }, [archivedTasks, filterCategory, dateFrom, dateTo]);

  const handleRestore = useCallback(
    async (task: Task) => {
      try {
        await updateTask({ ...task, archived: false, completed: false, completedAt: undefined });
        await loadArchived();
      } catch {
        showError('Impossible de restaurer la tache');
      }
    },
    [updateTask, loadArchived]
  );

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTask(id);
        await loadArchived();
      } catch {
        showError('Impossible de supprimer la tache');
      }
    },
    [deleteTask, loadArchived]
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col app-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 app-header backdrop-blur-xl backdrop-saturate-150 hairline-b">
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[color:var(--app-accent)] active:opacity-60 transition-opacity"
          aria-label="Retour"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="text-[17px] font-semibold app-text">
          Archives
        </h2>
        <span className="ios-body app-muted">
          ({filteredTasks.length})
        </span>
      </div>

      {/* Filters */}
      <div className="m-3 mb-0 p-3 rounded-2xl app-panel space-y-3">
        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'flex-shrink-0 px-3.5 py-1.5 rounded-full ios-caption font-semibold transition-opacity active:opacity-70',
              filterCategory === 'all'
                ? 'app-accent-bg'
                : 'app-surface-2 app-muted'
            )}
          >
            Toutes
          </button>
          {categoryKeys.map((key) => (
            <button
              key={key}
              onClick={() => setFilterCategory(key)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full ios-caption font-semibold transition-opacity active:opacity-70 whitespace-nowrap',
                filterCategory === key
                  ? 'app-accent-bg'
                  : 'app-surface-2 app-muted'
              )}
            >
              {CATEGORIES[key]}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-[12px] font-semibold app-muted uppercase tracking-wide mb-1">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text ios-body border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[12px] font-semibold app-muted uppercase tracking-wide mb-1">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text ios-body border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
            />
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <ListSkeleton count={5} Card={TaskItemSkeleton} />
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center app-panel">
            <svg
              className="w-16 h-16 app-muted mb-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 8v13H3V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </svg>
            <p className="ios-title3 app-muted">
              Aucune tache archivee
            </p>
          </div>
        ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="app-panel p-3.5"
                >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="ios-body font-medium app-muted line-through">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[12px] px-2 py-0.5 rounded-full app-chip">
                        {CATEGORIES[task.category]}
                      </span>
                      {task.completedAt && (
                        <span className="text-[12px] app-muted">
                          Termine {format(new Date(task.completedAt), 'dd MMM yyyy', { locale: fr })}
                        </span>
                      )}
                    </div>
                    {task.notes && (
                      <p className="ios-caption app-muted mt-1 truncate">
                        {task.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Restore button */}
                    <button
                      onClick={() => handleRestore(task)}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[color:var(--app-accent)] active:opacity-70 transition-opacity"
                      aria-label="Restaurer"
                      title="Restaurer"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>

                    {/* Delete permanently */}
                    <button
                      onClick={() => handlePermanentDelete(task.id)}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[color:var(--app-danger)] active:opacity-70 transition-opacity"
                      aria-label="Supprimer definitivement"
                      title="Supprimer definitivement"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskArchive;


