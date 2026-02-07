import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import { EQUIPMENT_TYPES } from '../../types';
import type { Equipment } from '../../types';
import { sanitizeInput } from '../../utils';

interface Props {
  onClose: () => void;
}

type EquipmentType = Equipment['type'];
const EQUIPMENT_TYPE_KEYS = Object.keys(EQUIPMENT_TYPES) as EquipmentType[];

interface FormState {
  name: string;
  type: EquipmentType;
  minTemp: string;
  maxTemp: string;
}

const emptyForm: FormState = { name: '', type: 'fridge', minTemp: '', maxTemp: '' };

export default function EquipmentManager({ onClose }: Props) {
  const equipment = useAppStore(s => s.equipment);
  const addEquipment = useAppStore(s => s.addEquipment);
  const updateEquipment = useAppStore(s => s.updateEquipment);
  const deleteEquipment = useAppStore(s => s.deleteEquipment);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startEdit = (eq: Equipment) => {
    setForm({
      name: sanitizeInput(eq.name),
      type: eq.type,
      minTemp: String(eq.minTemp),
      maxTemp: String(eq.maxTemp),
    });
    setEditingId(eq.id);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.name.trim()) {
      setError('Le nom est requis');
      return;
    }
    const minTemp = parseFloat(form.minTemp);
    const maxTemp = parseFloat(form.maxTemp);
    if (isNaN(minTemp) || isNaN(maxTemp)) {
      setError('Les temperatures doivent etre des nombres valides');
      return;
    }
    if (minTemp >= maxTemp) {
      setError('La temperature min doit etre inferieure a la max');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const existing = equipment.find(e => e.id === editingId);
        if (!existing) return;
        await updateEquipment({
          ...existing,
          name: sanitizeInput(form.name).trim(),
          type: form.type,
          minTemp,
          maxTemp,
        });
      } else {
        await addEquipment({
          id: crypto.randomUUID(),
          name: sanitizeInput(form.name).trim(),
          type: form.type,
          minTemp,
          maxTemp,
          order: equipment.length,
        });
      }
      resetForm();
    } catch {
      showError('Impossible de sauvegarder l\'equipement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEquipment(id);
      setDeleteConfirmId(null);
    } catch {
      showError('Impossible de supprimer l\'equipement');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-title"
        className="w-full max-w-lg max-h-[85vh] app-card flex flex-col overflow-hidden mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b app-border">
          <h2 id="equipment-title" className="text-lg font-bold app-text">Gestion des équipements</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-2 app-muted rounded-lg hover:bg-[color:var(--app-surface-3)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {equipment.length === 0 && !showForm && (
            <p className="text-center app-muted py-8">
              Aucun équipement. Ajoutez-en un ci-dessous.
            </p>
          )}

          {equipment.map(eq => (
            <div
              key={eq.id}
              className="flex items-center justify-between p-3 rounded-xl app-surface-2 app-border"
            >
              <div>
                <p className="font-semibold app-text">{eq.name}</p>
                <p className="text-xs app-muted">
                  {EQUIPMENT_TYPES[eq.type]} &middot; {eq.minTemp}°C ~ {eq.maxTemp}°C
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(eq)}
                  className="p-2 rounded-lg text-[color:var(--app-accent)] active:opacity-70"
                  aria-label={`Modifier ${eq.name}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {deleteConfirmId === eq.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(eq.id)}
                      className="px-2 py-1 text-xs rounded-lg app-danger-bg font-bold"
                    >
                      Confirmer
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-2 py-1 text-xs rounded-lg app-surface-2 app-text"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(eq.id)}
                    className="p-2 rounded-lg text-[color:var(--app-danger)] active:opacity-70"
                    aria-label={`Supprimer ${eq.name}`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add/Edit form */}
          {showForm && (
            <div className="rounded-xl p-4 space-y-3 border border-[color:var(--app-accent)]/40 bg-[color:var(--app-accent)]/10">
              <h3 className="font-bold app-text">
                {editingId ? 'Modifier l\'équipement' : 'Nouvel équipement'}
              </h3>

              <div>
                <label className="block text-sm font-medium app-muted mb-1">Nom</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: sanitizeInput(e.target.value) }))}
                  placeholder="Ex: Frigo cuisine"
                  className="w-full rounded-lg border app-border app-surface-2 app-text px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium app-muted mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(prev => ({ ...prev, type: e.target.value as EquipmentType }))}
                  className="w-full rounded-lg border app-border app-surface-2 app-text px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                >
                  {EQUIPMENT_TYPE_KEYS.map(key => (
                    <option key={key} value={key}>{EQUIPMENT_TYPES[key]}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium app-muted mb-1">Temp. min (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.minTemp}
                    onChange={e => setForm(prev => ({ ...prev, minTemp: e.target.value }))}
                    placeholder="-18"
                    className="w-full rounded-lg border app-border app-surface-2 app-text px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium app-muted mb-1">Temp. max (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.maxTemp}
                    onChange={e => setForm(prev => ({ ...prev, maxTemp: e.target.value }))}
                    placeholder="4"
                    className="w-full rounded-lg border app-border app-surface-2 app-text px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-[color:var(--app-danger)]">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className={`flex-1 py-2 rounded-lg app-accent-bg font-bold text-sm active:scale-[0.98] transition-all ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg app-surface-2 app-text font-medium text-sm hover:bg-[color:var(--app-surface-3)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && (
          <div className="px-5 py-4 border-t app-border">
            <button
              onClick={() => {
                setShowForm(true);
                setEditingId(null);
                setForm(emptyForm);
                setError('');
              }}
              className="w-full py-3 rounded-xl app-accent-bg font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un équipement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
