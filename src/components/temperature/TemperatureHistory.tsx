import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, startOfDay, endOfDay, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../../stores/appStore';
import { EQUIPMENT_TYPES } from '../../types';
import type { TemperatureRecord } from '../../types';
import { cn } from '../../utils';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function TemperatureHistory() {
  const equipment = useAppStore(s => s.equipment);
  const loadEquipment = useAppStore(s => s.loadEquipment);
  const getTemperatureRecords = useAppStore(s => s.getTemperatureRecords);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [records, setRecords] = useState<TemperatureRecord[]>([]);
  const [filterEquipmentId, setFilterEquipmentId] = useState<string>('');
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  const loadRecords = useCallback(async () => {
    let start: Date;
    let end: Date;

    if (dateRangeMode && rangeStart && rangeEnd) {
      start = startOfDay(rangeStart);
      end = endOfDay(rangeEnd);
    } else {
      start = startOfDay(selectedDate);
      end = endOfDay(selectedDate);
    }

    const data = await getTemperatureRecords(start, end, filterEquipmentId || undefined);
    setRecords(data);
  }, [selectedDate, filterEquipmentId, getTemperatureRecords, dateRangeMode, rangeStart, rangeEnd]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Calendar data
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // getDay: 0=Sun, adjust so Mon=0
    const startDow = (getDay(monthStart) + 6) % 7;
    const blanks = Array.from({ length: startDow }, () => null);

    return [...blanks, ...days];
  }, [currentMonth]);

  const handleDayClick = (day: Date) => {
    if (dateRangeMode) {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(day);
        setRangeEnd(null);
      } else {
        if (day < rangeStart) {
          setRangeEnd(rangeStart);
          setRangeStart(day);
        } else {
          setRangeEnd(day);
        }
      }
    } else {
      setSelectedDate(day);
    }
  };

  const filteredRecords = useMemo(() => {
    let result = records;
    if (anomaliesOnly) {
      result = result.filter(r => !r.isCompliant);
    }
    return result;
  }, [records, anomaliesOnly]);

  const equipmentMap = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment]);

  const isInRange = (day: Date) => {
    if (!dateRangeMode || !rangeStart) return false;
    if (!rangeEnd) return isSameDay(day, rangeStart);
    return day >= rangeStart && day <= rangeEnd;
  };

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
            className="p-2 rounded-lg app-muted hover:bg-[color:var(--app-surface-3)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="font-bold app-text capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
          </h3>
          <button
            onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
            className="p-2 rounded-lg app-muted hover:bg-[color:var(--app-surface-3)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium app-muted py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} />;
            const isSelected = !dateRangeMode && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const inRange = isInRange(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                className={cn(
                  'h-9 rounded-lg text-sm font-medium transition-colors',
                  isSelected && 'app-accent-bg',
                  inRange && !isSelected && 'bg-[color:var(--app-accent)]/12 text-[color:var(--app-accent)]',
                  isToday && !isSelected && !inRange && 'ring-2 ring-[color:var(--app-accent)]',
                  !isSelected && !inRange && 'app-text hover:bg-[color:var(--app-surface-3)]'
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>

        {/* Range toggle */}
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm app-muted cursor-pointer">
            <input
              type="checkbox"
              checked={dateRangeMode}
              onChange={e => {
                setDateRangeMode(e.target.checked);
                setRangeStart(null);
                setRangeEnd(null);
              }}
              className="rounded app-border text-[color:var(--app-accent)] focus:ring-[color:var(--app-accent)]"
            />
            Plage de dates
          </label>
          {dateRangeMode && rangeStart && rangeEnd && (
            <span className="text-xs app-muted">
              {format(rangeStart, 'dd/MM', { locale: fr })} - {format(rangeEnd, 'dd/MM', { locale: fr })}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterEquipmentId}
          onChange={e => setFilterEquipmentId(e.target.value)}
          className="flex-1 min-w-[140px] rounded-lg border app-border app-surface-2 app-text px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
        >
          <option value="">Tous les équipements</option>
          {equipment.map(eq => (
            <option key={eq.id} value={eq.id}>{eq.name}</option>
          ))}
        </select>

        <button
          onClick={() => setAnomaliesOnly(prev => !prev)}
          className={cn(
            'px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
            anomaliesOnly
              ? 'bg-[color:var(--app-danger)]/10 border-[color:var(--app-danger)]/40 text-[color:var(--app-danger)]'
              : 'app-surface-2 app-text border app-border'
          )}
        >
          Anomalies uniquement
        </button>
      </div>

      {/* Records list */}
      <div className="space-y-2">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-10 app-muted">
            <p className="text-lg font-medium">Aucun relevé</p>
            <p className="text-sm mt-1">
              {anomaliesOnly ? 'Aucune anomalie pour cette période' : 'Aucun relevé pour cette sélection'}
            </p>
          </div>
        ) : (
          filteredRecords.map(record => {
            const eq = equipmentMap.get(record.equipmentId);
            return (
              <div
                key={record.id}
                className={cn(
                  'rounded-xl p-3 border-l-4 app-card',
                  record.isCompliant
                    ? 'border-l-[color:var(--app-success)]'
                    : 'border-l-[color:var(--app-danger)] bg-[color:var(--app-danger)]/10'
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold app-text">
                      {eq?.name ?? 'Équipement inconnu'}
                    </p>
                    <p className="text-xs app-muted">
                      {format(new Date(record.timestamp), 'HH:mm', { locale: fr })}
                      {eq && ` \u00b7 ${EQUIPMENT_TYPES[eq.type]}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xl font-bold',
                        record.isCompliant ? 'text-[color:var(--app-success)]' : 'text-[color:var(--app-danger)]'
                      )}
                    >
                      {record.temperature}°C
                    </span>
                    <span
                      className={cn(
                        'text-xs font-bold px-2 py-1 rounded-full',
                        record.isCompliant
                          ? 'bg-[color:var(--app-success)]/15 text-[color:var(--app-success)]'
                          : 'bg-[color:var(--app-danger)]/15 text-[color:var(--app-danger)]'
                      )}
                    >
                      {record.isCompliant ? 'OK' : 'NON CONFORME'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
