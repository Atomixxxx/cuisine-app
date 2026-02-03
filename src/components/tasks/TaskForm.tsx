import React, { useState, useCallback, useEffect } from 'react';
import {
  CATEGORIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  type Task,
  type TaskCategory,
  type TaskPriority,
  type RecurringType,
} from '../../types';
import { cn } from '../../utils';

interface TaskFormProps {
  task?: Task | null;
  onSave: (data: Omit<Task, 'id' | 'createdAt' | 'completedAt' | 'completed' | 'archived' | 'order'>) => void | Promise<void>;
  onCancel: () => void;
}

const categoryKeys = Object.keys(CATEGORIES) as TaskCategory[];
const priorities: TaskPriority[] = ['high', 'normal', 'low'];
const recurringOptions: { value: RecurringType; label: string }[] = [
  { value: null, label: 'Aucune' },
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdomadaire' },
];

const TaskForm: React.FC<TaskFormProps> = ({ task, onSave, onCancel }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('autre');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState<RecurringType>(null);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setCategory(task.category);
      setPriority(task.priority);
      setEstimatedTime(task.estimatedTime != null ? String(task.estimatedTime) : '');
      setNotes(task.notes ?? '');
      setRecurring(task.recurring);
    }
  }, [task]);

  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        setTitleError(true);
        return;
      }
      if (saving) return;
      setSaving(true);
      try {
        await onSave({
          title: trimmed,
          category,
          priority,
          estimatedTime: estimatedTime ? parseInt(estimatedTime, 10) : undefined,
          notes: notes.trim() || undefined,
          recurring,
        });
      } finally {
        setSaving(false);
      }
    },
    [title, category, priority, estimatedTime, notes, recurring, onSave, saving]
  );

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] text-[17px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF]';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />

      {/* Modal */}
      <div role="dialog" aria-modal="true" aria-labelledby="taskform-title" className="relative w-full max-w-lg bg-white dark:bg-[#1d1d1f] rounded-t-[20px] sm:rounded-[20px] ios-card-shadow max-h-[90vh] overflow-y-auto">
        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-9 h-1 rounded-full bg-[#d1d1d6] dark:bg-[#38383a]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 id="taskform-title" className="ios-title3 text-[#1d1d1f] dark:text-[#f5f5f7]">
            {task ? 'Modifier la tâche' : 'Nouvelle tâche'}
          </h2>
          <button
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b] active:opacity-70 transition-opacity"
            aria-label="Fermer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">
              Titre <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder="Ex: Préparer la sauce béarnaise"
              aria-required="true"
              aria-invalid={titleError}
              aria-describedby={titleError ? 'err-title' : undefined}
              className={cn(
                inputClass,
                titleError && 'ring-2 ring-[#ff3b30]'
              )}
              autoFocus
            />
            {titleError && (
              <p id="err-title" className="mt-1 text-[13px] text-[#ff3b30]">Le titre est requis</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">
              Catégorie
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className={inputClass}
            >
              {categoryKeys.map((key) => (
                <option key={key} value={key}>
                  {CATEGORIES[key]}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">
              Priorité
            </label>
            <div className="flex gap-2" role="group" aria-label="Priorité">
              {priorities.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex-1 py-2.5 px-3 rounded-xl text-[15px] font-semibold transition-opacity active:opacity-70',
                    priority === p
                      ? 'text-white'
                      : 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b]'
                  )}
                  style={
                    priority === p
                      ? { backgroundColor: PRIORITY_COLORS[p] }
                      : undefined
                  }
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Estimated time */}
          <div>
            <label className="block text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">
              Temps estimé (minutes)
            </label>
            <input
              type="number"
              min="0"
              max="480"
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(e.target.value)}
              placeholder="Optionnel"
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détails supplémentaires..."
              rows={3}
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {/* Recurring */}
          <div>
            <label className="block text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">
              Récurrence
            </label>
            <div className="flex gap-2" role="group" aria-label="Récurrence">
              {recurringOptions.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  aria-pressed={recurring === opt.value}
                  onClick={() => setRecurring(opt.value)}
                  className={cn(
                    'flex-1 py-2.5 px-3 rounded-xl text-[15px] font-semibold transition-opacity active:opacity-70',
                    recurring === opt.value
                      ? 'bg-[#2997FF] text-white'
                      : 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 pb-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] font-semibold text-[17px] active:opacity-70 transition-opacity"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "flex-1 py-3 rounded-xl bg-[#2997FF] text-white font-semibold text-[17px] active:opacity-70 transition-opacity",
                saving && "opacity-40 cursor-not-allowed"
              )}
            >
              {saving ? 'Enregistrement...' : task ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskForm;
