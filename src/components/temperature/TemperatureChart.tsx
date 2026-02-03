import React, { useState, useEffect, useMemo } from 'react';
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

  useEffect(() => {
    if (equipment.length > 0 && !selectedEquipmentId) {
      setSelectedEquipmentId(equipment[0].id);
    }
  }, [equipment, selectedEquipmentId]);

  useEffect(() => {
    if (!selectedEquipmentId) return;

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

    getTemperatureRecords(start, end, selectedEquipmentId).then(setRecords).catch(() => showError('Impossible de charger les releves'));
  }, [selectedEquipmentId, rangeOption, customStart, customEnd, getTemperatureRecords]);

  const selectedEquipment = useMemo(
    () => equipment.find(e => e.id === selectedEquipmentId),
    [equipment, selectedEquipmentId]
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

  const CustomDot = (props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={payload.isCompliant ? '#22c55e' : '#ef4444'}
        stroke="#fff"
        strokeWidth={2}
      />
    );
  };

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
              selectedEquipmentId === eq.id
                ? 'bg-[#2997FF] border-blue-600 text-white'
                : 'bg-white dark:bg-[#1d1d1f] border-[#d1d1d6] dark:border-[#38383a] text-[#1d1d1f] dark:text-[#86868b] active:border-[#2997FF]'
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
                ? 'bg-[#1d1d1f] dark:bg-white border-gray-900 dark:border-white text-white dark:text-[#1d1d1f]'
                : 'bg-white dark:bg-[#1d1d1f] border-[#d1d1d6] dark:border-[#38383a] text-[#1d1d1f] dark:text-[#86868b]'
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
              className="rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] px-2 py-2 text-sm focus:ring-2 focus:ring-[#2997FF]"
            />
            <span className="text-[#86868b]">-</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] px-2 py-2 text-sm focus:ring-2 focus:ring-[#2997FF]"
            />
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-[#1d1d1f] rounded-xl border border-[#e8e8ed] dark:border-[#38383a] p-4">
        {chartData.length === 0 ? (
          <div className="text-center py-16 text-[#86868b] dark:text-[#86868b]">
            <p className="text-lg font-medium">Aucune donnée</p>
            <p className="text-sm mt-1">Aucun relevé pour cette période et cet équipement</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                domain={['auto', 'auto']}
                unit="°C"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                formatter={(value: number | undefined) => [`${value ?? 0}°C`, 'Température']}
                labelFormatter={(label: any) => String(label)}
              />
              {selectedEquipment && (
                <>
                  <ReferenceLine
                    y={selectedEquipment.maxTemp}
                    stroke="#ef4444"
                    strokeDasharray="6 3"
                    label={{ value: `Max ${selectedEquipment.maxTemp}°C`, position: 'right', fontSize: 11, fill: '#ef4444' }}
                  />
                  <ReferenceLine
                    y={selectedEquipment.minTemp}
                    stroke="#3b82f6"
                    strokeDasharray="6 3"
                    label={{ value: `Min ${selectedEquipment.minTemp}°C`, position: 'right', fontSize: 11, fill: '#3b82f6' }}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="#6366f1"
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 7, stroke: '#6366f1', strokeWidth: 2 }}
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
              color: 'text-[#2997FF] dark:text-[#2997FF]',
            },
            {
              label: 'Min',
              value: Math.min(...chartData.map(p => p.temperature)).toFixed(1),
              color: 'text-cyan-600 dark:text-cyan-400',
            },
            {
              label: 'Max',
              value: Math.max(...chartData.map(p => p.temperature)).toFixed(1),
              color: 'text-orange-600 dark:text-orange-400',
            },
          ].map(stat => (
            <div key={stat.label} className="bg-white dark:bg-[#1d1d1f] rounded-xl border border-[#e8e8ed] dark:border-[#38383a] p-3 text-center">
              <p className="text-xs text-[#86868b] dark:text-[#86868b] mb-1">{stat.label}</p>
              <p className={cn('text-xl font-bold', stat.color)}>{stat.value}°C</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
