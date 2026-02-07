import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { isToday } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { CATEGORIES, type Task, type TaskCategory } from '../../types';
import { cn, vibrate } from '../../utils';
import { showError } from '../../stores/toastStore';
import TaskList from '../../components/tasks/TaskList';
import TaskForm from '../../components/tasks/TaskForm';
import TaskArchive from '../../components/tasks/TaskArchive';

const categoryKeys = Object.keys(CATEGORIES) as TaskCategory[];

const TasksPage: React.FC = () => {
  const getTasks = useAppStore((s) => s.getTasks);
  const addTask = useAppStore((s) => s.addTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const deleteTask = useAppStore((s) => s.deleteTask);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [filterCategory, setFilterCategory] = useState<TaskCategory | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await getTasks(false);
      setTasks(loaded);
    } catch {
      showError('Impossible de charger les taches');
    } finally {
      setLoading(false);
    }
  }, [getTasks]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const quick = searchParams.get('quick');
    if (quick !== 'new') return;
    setEditingTask(null);
    setShowForm(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('quick');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const filteredTasks = useMemo(() => {
    if (filterCategory === 'all') return tasks;
    return tasks.filter((t) => t.category === filterCategory);
  }, [tasks, filterCategory]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const todayTasks = useMemo(() => tasks.filter((t) => isToday(new Date(t.createdAt))), [tasks]);
  const todayCompleted = useMemo(() => todayTasks.filter((t) => t.completed).length, [todayTasks]);
  const todayTotal = todayTasks.length;
  const progressPercent = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        const now = new Date();
        const updated: Task = {
          ...task,
          completed: !task.completed,
          completedAt: !task.completed ? now : undefined,
          archived: !task.completed,
        };
        await updateTask(updated);
        await loadTasks();
      } catch {
        showError('Impossible de mettre a jour la tache');
      }
    },
    [updateTask, loadTasks],
  );

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTask(id);
        await loadTasks();
      } catch {
        showError('Impossible de supprimer la tache');
      }
    },
    [deleteTask, loadTasks],
  );

  const handleSave = useCallback(
    async (data: Omit<Task, 'id' | 'createdAt' | 'completedAt' | 'completed' | 'archived' | 'order'>) => {
      try {
        if (editingTask) {
          const updated: Task = {
            ...editingTask,
            ...data,
          };
          await updateTask(updated);
        } else {
          const newTask: Task = {
            id: crypto.randomUUID(),
            ...data,
            completed: false,
            archived: false,
            createdAt: new Date(),
            order: tasks.length,
          };
          await addTask(newTask);
          vibrate(20);
        }
        setShowForm(false);
        setEditingTask(null);
        await loadTasks();
      } catch {
        showError('Impossible de sauvegarder la tache');
      }
    },
    [editingTask, tasks.length, addTask, updateTask, loadTasks],
  );

  const handleCancelForm = useCallback(() => {
    setShowForm(false);
    setEditingTask(null);
  }, []);

  if (showArchive) {
    return (
      <TaskArchive
        onClose={() => {
          setShowArchive(false);
          void loadTasks();
        }}
      />
    );
  }

  return (
    <div className="app-page-wrap h-full pb-28">
      <div className="app-hero-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="ios-title app-text">Taches</h1>
            <p className="text-[14px] app-muted">
              {activeTasks.length} restante{activeTasks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowArchive(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold app-surface-2 app-text active:opacity-70 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v13H3V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </svg>
            Archives
          </button>
        </div>

        <div className="app-kpi-grid">
          <div className="app-kpi-card">
            <p className="app-kpi-label">Actives</p>
            <p className="app-kpi-value">{activeTasks.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Creees aujourd'hui</p>
            <p className="app-kpi-value">{todayTotal}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Terminees aujourd'hui</p>
            <p className="app-kpi-value">{todayCompleted}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Progression</p>
            <p className="app-kpi-value">{progressPercent}%</p>
          </div>
        </div>

        {todayTotal > 0 && (
          <div className="rounded-xl app-surface-2 p-3 border border-[color:var(--app-border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] app-muted">Progression du jour</span>
              <span className="text-[13px] font-semibold app-text">
                {todayCompleted}/{todayTotal} ({progressPercent}%)
              </span>
            </div>
            <div className="w-full h-1.5 app-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-[color:var(--app-success)] rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="app-panel space-y-3">
        <div className="ios-segmented">
          <button onClick={() => setGrouped(true)} className={cn('ios-segmented-item', grouped && 'active')}>
            Par categorie
          </button>
          <button onClick={() => setGrouped(false)} className={cn('ios-segmented-item', !grouped && 'active')}>
            Liste
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'flex-shrink-0 app-chip-btn whitespace-nowrap active:opacity-70',
              filterCategory === 'all' ? 'app-accent-bg' : 'app-surface-2 app-muted',
            )}
          >
            Toutes
          </button>
          {categoryKeys.map((key) => (
            <button
              key={key}
              onClick={() => setFilterCategory(key)}
              className={cn(
                'flex-shrink-0 app-chip-btn whitespace-nowrap active:opacity-70',
                filterCategory === key ? 'app-accent-bg' : 'app-surface-2 app-muted',
              )}
            >
              {CATEGORIES[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <TaskList tasks={filteredTasks} grouped={grouped} onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </div>

      <button
        onClick={() => {
          setEditingTask(null);
          setShowForm(true);
        }}
        className="fixed bottom-20 right-4 w-14 h-14 app-accent-bg rounded-full flex items-center justify-center active:opacity-70 transition-opacity z-40 shadow-[0_10px_22px_rgba(41,151,255,0.4)]"
        aria-label="Ajouter une tache"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {showForm && <TaskForm task={editingTask} onSave={handleSave} onCancel={handleCancelForm} />}
    </div>
  );
};

export default TasksPage;
