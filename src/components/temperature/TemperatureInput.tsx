import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import { EQUIPMENT_TYPES } from '../../types';
import type { Equipment, TemperatureRecord } from '../../types';
import { formatDate, cn, vibrate } from '../../utils';

interface NumpadModalProps {
  equipment: Equipment;
  onClose: () => void;
  onSubmit: (value: number) => Promise<void> | void;
}

function NumpadModal({ equipment, onClose, onSubmit }: NumpadModalProps) {
  const [display, setDisplay] = useState('');
  const [hasDecimal, setHasDecimal] = useState(false);
  const [isNegative, setIsNegative] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleKey = useCallback(async (key: string) => {
    switch (key) {
      case 'backspace': {
        if (display.length === 0) return;
        const removed = display[display.length - 1];
        if (removed === '.') setHasDecimal(false);
        setDisplay(prev => prev.slice(0, -1));
        break;
      }
      case '.': {
        if (hasDecimal) return;
        setHasDecimal(true);
        setDisplay(prev => (prev.length === 0 ? '0.' : prev + '.'));
        break;
      }
      case '±': {
        setIsNegative(prev => !prev);
        break;
      }
      case 'confirm': {
        if (saving) return;
        const raw = display.length === 0 ? '0' : display;
        const value = parseFloat((isNegative ? '-' : '') + raw);
        if (isNaN(value)) return;
        setSaving(true);
        try {
          await onSubmit(value);
        } finally {
          setSaving(false);
        }
        break;
      }
      default: {
        if (display === '0' && key === '0') return;
        if (display.length >= 6) return;
        setDisplay(prev => prev + key);
      }
    }
  }, [display, hasDecimal, isNegative, saving, onSubmit]);

  const displayValue = (isNegative ? '-' : '') + (display || '0');

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['±', '0', '.'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="numpad-title"
        className="w-full max-w-sm rounded-t-[20px] sm:rounded-[20px] p-4 animate-slide-up app-card"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pb-2 sm:hidden">
          <div className="w-9 h-1 rounded-full app-surface-3" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 id="numpad-title" className="ios-title3 app-text">{equipment.name}</h3>
            <p className="text-[13px] app-muted">
              {EQUIPMENT_TYPES[equipment.type]} &middot; {equipment.minTemp}°C ~ {equipment.maxTemp}°C
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full app-surface-2 app-muted active:opacity-70">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Display */}
        <div className="app-surface-2 rounded-2xl p-5 mb-4 text-center">
          <span className="text-5xl font-mono font-bold app-text">
            {displayValue}
          </span>
          <span className="text-2xl font-bold app-muted ml-1">°C</span>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {keys.map((row, ri) =>
            row.map((key) => (
              <button
                key={`${ri}-${key}`}
                onClick={() => handleKey(key)}
                className={cn(
                  'min-h-[60px] min-w-[48px] rounded-2xl text-xl font-bold transition-opacity active:opacity-70',
                  key === '±'
                    ? 'bg-[color:var(--app-warning)]/15 text-[color:var(--app-warning)]'
                    : 'app-surface-2 app-text'
                )}
              >
                {key === '±' ? (isNegative ? '+' : '−') : key}
              </button>
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleKey('backspace')}
            className="min-h-[60px] rounded-2xl text-lg font-bold app-surface-2 app-text active:opacity-70 flex items-center justify-center gap-2"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H21a1 1 0 011 1v12a1 1 0 01-1 1H10.828a2 2 0 01-1.414-.586L3 12z" />
            </svg>
            Effacer
          </button>
          <button
            onClick={() => handleKey('confirm')}
            disabled={saving}
            className={cn(
              "min-h-[60px] rounded-2xl text-lg font-bold app-accent-bg active:opacity-70",
              saving && "opacity-40 cursor-not-allowed"
            )}
          >
            {saving ? 'Envoi...' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemperatureInput() {
  const equipment = useAppStore(s => s.equipment);
  const loadEquipment = useAppStore(s => s.loadEquipment);
  const addTemperatureRecord = useAppStore(s => s.addTemperatureRecord);
  const getTemperatureRecords = useAppStore(s => s.getTemperatureRecords);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [recentRecords, setRecentRecords] = useState<Map<string, TemperatureRecord>>(new Map());
  const [flashStates, setFlashStates] = useState<Map<string, 'green' | 'red'>>(new Map());

  const loadRecent = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const records = await getTemperatureRecords(today);
      const latest = new Map<string, TemperatureRecord>();
      for (const r of records) {
        const existing = latest.get(r.equipmentId);
        if (!existing || new Date(r.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
          latest.set(r.equipmentId, r);
        }
      }
      setRecentRecords(latest);
    } catch {
      showError('Impossible de charger les releves recents');
    }
  }, [getTemperatureRecords]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  useEffect(() => {
    if (equipment.length > 0) {
      loadRecent();
    }
  }, [equipment, loadRecent]);

  const handleSubmit = async (value: number) => {
    if (!selectedEquipment) return;

    const isCompliant = value >= selectedEquipment.minTemp && value <= selectedEquipment.maxTemp;

    const record: TemperatureRecord = {
      id: crypto.randomUUID(),
      equipmentId: selectedEquipment.id,
      temperature: value,
      timestamp: new Date(),
      isCompliant,
    };

    try {
      await addTemperatureRecord(record);
    } catch {
      showError('Impossible d\'enregistrer le releve');
      return;
    }

    const eqId = selectedEquipment.id;
    setFlashStates(prev => new Map(prev).set(eqId, isCompliant ? 'green' : 'red'));

    if (!isCompliant) {
      vibrate(200);
    }

    setTimeout(() => {
      setFlashStates(prev => {
        const next = new Map(prev);
        next.delete(eqId);
        return next;
      });
    }, 1200);

    setSelectedEquipment(null);
    await loadRecent();
  };

  if (equipment.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="w-16 h-16 app-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="ios-title3 app-muted">Aucun équipement</p>
        <p className="text-[15px] app-muted mt-1">
          Ajoutez des équipements via le bouton Équipements
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {equipment.map(eq => {
        const recent = recentRecords.get(eq.id);
        const flash = flashStates.get(eq.id);

        return (
          <button
            key={eq.id}
            onClick={() => setSelectedEquipment(eq)}
            className={cn(
              'w-full text-left rounded-2xl p-4 transition-all duration-300 active:opacity-70',
              flash === 'green' && 'bg-[color:var(--app-success)]/12 ring-2 ring-[color:var(--app-success)]',
              flash === 'red' && 'bg-[color:var(--app-danger)]/12 ring-2 ring-[color:var(--app-danger)] animate-pulse',
              !flash && 'app-card'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold app-text text-[17px]">{eq.name}</h3>
                  <span className="text-[12px] px-2 py-0.5 rounded-full app-chip font-medium">
                    {EQUIPMENT_TYPES[eq.type]}
                  </span>
                </div>
                <p className="text-[13px] app-muted mt-0.5">
                  Plage : {eq.minTemp}°C ~ {eq.maxTemp}°C
                </p>
              </div>

              <div className="text-right">
                {recent ? (
                  <>
                    <span
                      className={cn(
                        'text-2xl font-bold',
                        recent.isCompliant ? 'text-[color:var(--app-success)]' : 'text-[color:var(--app-danger)]'
                      )}
                    >
                      {recent.temperature}°C
                    </span>
                    <p className="text-[12px] app-muted mt-0.5">
                      {formatDate(recent.timestamp)}
                    </p>
                  </>
                ) : (
                  <span className="text-[15px] app-muted italic">
                    Aucun relevé
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {selectedEquipment && (
        <NumpadModal
          equipment={selectedEquipment}
          onClose={() => setSelectedEquipment(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
