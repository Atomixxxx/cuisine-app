import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { TemperatureRecord } from '../../types';
import { cn } from '../../utils';

type RangeOption = '7d' | '30d' | 'custom';

interface ChartPoint {
  timestamp: number;
  temperature: number;
  isCompliant: boolean;
  label: string;
}

function TemperatureDot(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={payload.isCompliant ? 'var(--app-success)' : 'var(--app-danger)'}
      stroke="var(--app-surface)"
      strokeWidth={2}
    />
  );
}

const TEMPERATURE_DOT = <TemperatureDot />;

export default function TemperatureChart() {
  const equipment = useAppStore(s => s.equipment);
  const loadEquipment = useAppStore(s => s.loadEquipment);
  const getTemperatureRecords = useAppStore(s => s.getTemperatureRecords);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [rangeOption, setRangeOption] = useState<RangeOption>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [records, setRecords] = useState<TemperatureRecord[]>([]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);
  const effectiveSelectedEquipmentId = selectedEquipmentId || equipment[0]?.id || '';

  useEffect(() => {
    if (!effectiveSelectedEquipmentId) return;

    let start: Date;
    let end: Date = endOfDay(new Date());

    if (rangeOption === '7d') {
      start = startOfDay(subDays(new Date(), 7));
    } else if (rangeOption === '30d') {
      start = startOfDay(subDays(new Date(), 30));
    } else {
      if (!customStart || !customEnd) return;
      start = startOfDay(new Date(customStart));
      end = endOfDay(new Date(customEnd));
    }

    getTemperatureRecords(start, end, effectiveSelectedEquipmentId).then(setRecords).catch(() => showError('Impossible de charger les releves'));
  }, [effectiveSelectedEquipmentId, rangeOption, customStart, customEnd, getTemperatureRecords]);

  const selectedEquipment = useMemo(
    () => equipment.find(e => e.id === effectiveSelectedEquipmentId),
    [equipment, effectiveSelectedEquipmentId]
  );

  const chartData: ChartPoint[] = useMemo(() => {
    return [...records]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(r => ({
        timestamp: new Date(r.timestamp).getTime(),
        temperature: r.temperature,
        isCompliant: r.isCompliant,
        label: format(new Date(r.timestamp), 'dd/MM HH:mm', { locale: fr }),
      }));
  }, [records]);

  const rangeButtons: { key: RangeOption; label: string }[] = [
    { key: '7d', label: '7 jours' },
    { key: '30d', label: '30 jours' },
    { key: 'custom', label: 'Personnalisé' },
  ];

  return (
    <div className="space-y-4">
      {/* Equipment selector */}
      <div className="flex flex-wrap gap-2">
        {equipment.map(eq => (
          <button
            key={eq.id}
            onClick={() => setSelectedEquipmentId(eq.id)}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
              effectiveSelectedEquipmentId === eq.id
                ? 'app-surface border-[color:var(--app-accent)] text-[color:var(--app-accent)]'
                : 'app-surface-2 app-text border app-border active:border-[color:var(--app-accent)]'
            )}
          >
            {eq.name}
          </button>
        ))}
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-2 items-end">
        {rangeButtons.map(rb => (
          <button
            key={rb.key}
            onClick={() => setRangeOption(rb.key)}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
              rangeOption === rb.key
                ? 'app-surface border-[color:var(--app-accent)] text-[color:var(--app-accent)]'
                : 'app-surface-2 app-text border app-border'
            )}
          >
            {rb.label}
          </button>
        ))}

        {rangeOption === 'custom' && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="rounded-lg border app-border app-surface-2 app-text px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
            />
            <span className="app-muted">-</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="rounded-lg border app-border app-surface-2 app-text px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
            />
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="app-card p-4">
        {chartData.length === 0 ? (
          <div className="text-center py-16 app-muted ">
            <p className="text-lg font-medium">Aucune donnée</p>
            <p className="text-sm mt-1">Aucun relevé pour cette période et cet équipement</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--app-muted)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--app-muted)' }}
                domain={['auto', 'auto']}
                unit="°C"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--app-text)',
                }}
                formatter={(value: number | undefined) => [`${value ?? 0}°C`, 'Température']}
                labelFormatter={(label: ReactNode) => String(label ?? '')}
              />
              {selectedEquipment && (
                <>
                  <ReferenceLine
                    y={selectedEquipment.maxTemp}
                    stroke="var(--app-danger)"
                    strokeDasharray="6 3"
                    label={{ value: `Max ${selectedEquipment.maxTemp}°C`, position: 'right', fontSize: 11, fill: 'var(--app-danger)' }}
                  />
                  <ReferenceLine
                    y={selectedEquipment.minTemp}
                    stroke="var(--app-info)"
                    strokeDasharray="6 3"
                    label={{ value: `Min ${selectedEquipment.minTemp}°C`, position: 'right', fontSize: 11, fill: 'var(--app-info)' }}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="var(--app-accent)"
                strokeWidth={2}
                dot={TEMPERATURE_DOT}
                activeDot={{ r: 7, stroke: 'var(--app-accent)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Moyenne',
              value: (chartData.reduce((s, p) => s + p.temperature, 0) / chartData.length).toFixed(1),
              color: 'text-[color:var(--app-accent)]',
            },
            {
              label: 'Min',
              value: Math.min(...chartData.map(p => p.temperature)).toFixed(1),
              color: 'text-[color:var(--app-info)]',
            },
            {
              label: 'Max',
              value: Math.max(...chartData.map(p => p.temperature)).toFixed(1),
              color: 'text-[color:var(--app-warning)]',
            },
          ].map(stat => (
            <div key={stat.label} className="app-card p-3 text-center">
              <p className="text-xs app-muted  mb-1">{stat.label}</p>
              <p className={cn('text-xl font-bold', stat.color)}>{stat.value}°C</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
