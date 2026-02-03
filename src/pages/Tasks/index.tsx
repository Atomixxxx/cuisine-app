import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { isToday } from 'date-fns';
import { useAppStore } from '../../stores/appStore';
import {
  CATEGORIES,
  type Task,
  type TaskCategory,
  type RecurringType,
} from '../../types';
import { cn, vibrate } from '../../utils';
import { showError } from '../../stores/toastStore';
import TaskList from '../../components/tasks/TaskList';
import TaskForm from '../../components/tasks/TaskForm';
import TaskArchive from '../../components/tasks/TaskArchive';

const categoryKeys = Object.keys(CATEGORIES) as TaskCategory[];

const TasksPage: React.FC = () => {
  const getTasks = useAppStore(s => s.getTasks);
  const addTask = useAppStore(s => s.addTask);
  const updateTask = useAppStore(s => s.updateTask);
  const deleteTask = useAppStore(s => s.deleteTask);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [filterCategory, setFilterCategory] = useState<TaskCategory | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showArchive, setShowArchive] = useState(false);

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
    loadTasks();
  }, [loadTasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    if (filterCategory === 'all') return tasks;
    return tasks.filter((t) => t.category === filterCategory);
  }, [tasks, filterCategory]);

  // Stats
  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const todayTasks = useMemo(
    () => tasks.filter((t) => isToday(new Date(t.createdAt))),
    [tasks]
  );
  const todayCompleted = useMemo(
    () => todayTasks.filter((t) => t.completed).length,
    [todayTasks]
  );
  const todayTotal = todayTasks.length;
  const progressPercent = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  // Handlers
  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        const now = new Date();
        const updated: Task = {
          ...task,
          completed: !task.completed,
          completedAt: !task.completed ? now : undefined,
          archived: !task.completed ? true : false,
        };
        await updateTask(updated);
        await loadTasks();
      } catch {
        showError('Impossible de mettre a jour la tache');
      }
    },
    [updateTask, loadTasks]
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
    [deleteTask, loadTasks]
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
    [editingTask, tasks.length, addTask, updateTask, loadTasks]
  );

  const handleCancelForm = useCallback(() => {
    setShowForm(false);
    setEditingTask(null);
  }, []);

  // Archive view
  if (showArchive) {
    return <TaskArchive onClose={() => { setShowArchive(false); loadTasks(); }} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="ios-title text-[#1d1d1f] dark:text-[#f5f5f7]">
              Tâches
            </h1>
            <p className="text-[15px] text-[#86868b] mt-1">
              {activeTasks.length} tâche{activeTasks.length !== 1 ? 's' : ''} restante{activeTasks.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Archive button */}
          <button
            onClick={() => setShowArchive(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-[#2997FF] bg-[#2997FF]/10/15 active:opacity-70 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v13H3V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </svg>
            Archives
          </button>
        </div>

        {/* Progress bar */}
        {todayTotal > 0 && (
          <div className="mb-4 p-4 bg-white dark:bg-[#1d1d1f] rounded-2xl ios-card-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[#86868b]">
                Progression du jour
              </span>
              <span className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {todayCompleted}/{todayTotal} ({progressPercent}%)
              </span>
            </div>
            <div className="w-full h-1 bg-[#e8e8ed] dark:bg-[#38383a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#34c759] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* iOS Segmented Control for view */}
        <div className="ios-segmented mb-3">
          <button
            onClick={() => setGrouped(true)}
            className={cn('ios-segmented-item', grouped && 'active')}
          >
            Par catégorie
          </button>
          <button
            onClick={() => setGrouped(false)}
            className={cn('ios-segmented-item', !grouped && 'active')}
          >
            Liste
          </button>
        </div>

        {/* Category filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-opacity active:opacity-70',
              filterCategory === 'all'
                ? 'bg-[#2997FF] text-white'
                : 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b]'
            )}
          >
            Toutes
          </button>
          {categoryKeys.map((key) => (
            <button
              key={key}
              onClick={() => setFilterCategory(key)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-opacity active:opacity-70 whitespace-nowrap',
                filterCategory === key
                  ? 'bg-[#2997FF] text-white'
                  : 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b]'
              )}
            >
              {CATEGORIES[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#2997FF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <TaskList
            tasks={filteredTasks}
            grouped={grouped}
            onToggle={handleToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* FAB - iOS blue */}
      <button
        onClick={() => {
          setEditingTask(null);
          setShowForm(true);
        }}
        className="fixed bottom-20 right-4 w-14 h-14 bg-[#2997FF] text-white rounded-full flex items-center justify-center active:opacity-70 transition-opacity z-40"
        style={{ boxShadow: '0 2px 12px rgba(0,122,255,0.4)' }}
        aria-label="Ajouter une tâche"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Task form modal */}
      {showForm && (
        <TaskForm
          task={editingTask}
          onSave={handleSave}
          onCancel={handleCancelForm}
        />
      )}
    </div>
  );
};

export default TasksPage;
