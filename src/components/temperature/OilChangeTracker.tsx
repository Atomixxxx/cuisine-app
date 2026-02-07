import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../../stores/appStore';
import type { OilChangeRecord } from '../../types';
import { showError, showSuccess } from '../../stores/toastStore';
import { generateOilChangePDF } from '../../services/pdf';
import { cn } from '../../utils';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DEFAULT_FRYERS = ['Friteuse N1', 'Friteuse N2', 'Friteuse N3'];

interface OilChangeTrackerProps {
  establishmentName?: string;
}

export default function OilChangeTracker({ establishmentName }: OilChangeTrackerProps) {
  const getOilChangeRecords = useAppStore((s) => s.getOilChangeRecords);
  const addOilChangeRecord = useAppStore((s) => s.addOilChangeRecord);
  const removeOilChangeRecord = useAppStore((s) => s.removeOilChangeRecord);

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedFryer, setSelectedFryer] = useState<string>('Friteuse N1');
  const [operator, setOperator] = useState('');
  const [records, setRecords] = useState<OilChangeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOilChangeRecords(monthStart, monthEnd);
      setRecords(data);
    } catch {
      showError('Impossible de charger les changements d huile');
    } finally {
      setLoading(false);
    }
  }, [getOilChangeRecords, monthStart, monthEnd]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const fryerOptions = useMemo(() => {
    const known = new Set(DEFAULT_FRYERS);
    records.forEach((record) => known.add(record.fryerId));
    return Array.from(known);
  }, [records]);

  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDow = (getDay(monthStart) + 6) % 7;
    const blanks = Array.from({ length: startDow }, () => null);
    return [...blanks, ...days];
  }, [monthStart, monthEnd]);

  const selectedRecords = useMemo(
    () => records.filter((record) => record.fryerId === selectedFryer),
    [records, selectedFryer],
  );

  const hasRecordForDay = useCallback(
    (day: Date) => selectedRecords.some((record) => isSameDay(new Date(record.changedAt), day)),
    [selectedRecords],
  );

  const findRecordForDay = useCallback(
    (day: Date) => selectedRecords.find((record) => isSameDay(new Date(record.changedAt), day)),
    [selectedRecords],
  );

  const handleDayClick = async (day: Date) => {
    const existing = findRecordForDay(day);

    if (existing) {
      const shouldDelete = window.confirm('Un changement est deja note ce jour-la. Voulez-vous le retirer ?');
      if (!shouldDelete) return;
      try {
        await removeOilChangeRecord(existing.id);
        showSuccess('Changement retire');
        await loadRecords();
      } catch {
        showError('Impossible de retirer le changement');
      }
      return;
    }

    const changedAt = startOfDay(day);
    changedAt.setHours(12, 0, 0, 0);

    try {
      await addOilChangeRecord({
        id: crypto.randomUUID(),
        fryerId: selectedFryer,
        changedAt,
        action: 'changed',
        operator: operator.trim() || undefined,
      });
      showSuccess(`Changement enregistre pour ${selectedFryer}`);
      await loadRecords();
    } catch {
      showError('Impossible d enregistrer le changement');
    }
  };

  const handleExportPdf = () => {
    const periodLabel = `${format(monthStart, 'dd/MM/yyyy', { locale: fr })} - ${format(monthEnd, 'dd/MM/yyyy', { locale: fr })}`;
    generateOilChangePDF(selectedRecords, establishmentName || 'Mon etablissement', periodLabel);
  };

  return (
    <div className="space-y-3">
      <div className="app-panel space-y-3">
        <h3 className="text-[16px] font-semibold app-text">Suivi huile friteuse (HACCP)</h3>
        <p className="text-[13px] app-muted">
          Une feuille de changement d huile est un document de suivi utilise en restauration pour controler la qualite et le renouvellement des huiles de friture,
          garantissant la securite alimentaire (normes HACCP).
        </p>
        <div className="rounded-xl app-surface-2 p-3 text-[13px] app-muted space-y-1">
          <p className="font-semibold app-text">Modele type</p>
          <p>Date et heure du changement</p>
          <p>Identifiant de la friteuse</p>
          <p>Resultats de tests (visuel, olfactif, chimique)</p>
          <p>Temperature de l huile</p>
          <p>Visa operateur et action</p>
        </div>
      </div>

      <div className="app-panel space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-2">
          <select value={selectedFryer} onChange={(e) => setSelectedFryer(e.target.value)} className="app-input">
            {fryerOptions.map((fryer) => (
              <option key={fryer} value={fryer}>
                {fryer}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="Operateur (optionnel)"
            className="app-input"
          />
          <button onClick={handleExportPdf} className="px-4 py-2.5 rounded-xl app-accent-bg text-[14px] font-semibold active:opacity-70">
            Export PDF
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))} className="p-2 rounded-lg app-surface-2 app-muted">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="font-bold app-text capitalize">{format(currentMonth, 'MMMM yyyy', { locale: fr })}</h3>
          <button onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))} className="p-2 rounded-lg app-surface-2 app-muted">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map((label) => (
            <div key={label} className="text-center text-xs font-medium app-muted py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            if (!day) return <div key={`blank-${index}`} />;
            const done = hasRecordForDay(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => {
                  void handleDayClick(day);
                }}
                className={cn(
                  'h-10 rounded-lg text-sm font-semibold transition-colors',
                  done ? 'app-success-bg' : 'app-surface-2 app-text hover:bg-[color:var(--app-surface-3)]',
                )}
                title={done ? 'Changement enregistre' : 'Cliquer pour enregistrer le changement'}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>

        <p className="text-[12px] app-muted">Clique une date pour marquer que {selectedFryer} a ete changee.</p>
      </div>

      <div className="app-panel">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[15px] font-semibold app-text">Historique ({selectedRecords.length})</h4>
          {loading && <span className="text-[12px] app-muted">Chargement...</span>}
        </div>

        {selectedRecords.length === 0 ? (
          <p className="text-[13px] app-muted">Aucun changement enregistre pour cette friteuse sur cette periode.</p>
        ) : (
          <div className="space-y-2">
            {selectedRecords.map((record) => (
              <div key={record.id} className="rounded-xl app-surface-2 border border-[color:var(--app-border)] px-3 py-2">
                <p className="text-[14px] font-semibold app-text">{record.fryerId} - huile changee</p>
                <p className="text-[12px] app-muted">
                  {format(new Date(record.changedAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
                  {record.operator ? ` - Operateur: ${record.operator}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
