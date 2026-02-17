import { useEffect, useMemo, useState } from 'react';
import { endOfDay, format, startOfDay, startOfMonth, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { TemperatureRecord } from '../../types';
import AnalyticsKpiRow, { type AnalyticsKpiItem } from './AnalyticsKpiRow';
import { computeComplianceTrend, computeEquipmentBreakdown } from '../../services/analyticsEngine';
import { cn } from '../../utils';

export default function TemperatureComplianceSection() {
  const equipment = useAppStore((s) => s.equipment);
  const loadEquipment = useAppStore((s) => s.loadEquipment);
  const getTemperatureRecords = useAppStore((s) => s.getTemperatureRecords);

  const [loading, setLoading] = useState(true);
  const [records7d, setRecords7d] = useState<TemperatureRecord[]>([]);
  const [records30d, setRecords30d] = useState<TemperatureRecord[]>([]);
  const [recordsMonth, setRecordsMonth] = useState<TemperatureRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    const now = new Date();
    Promise.all([
      loadEquipment(),
      getTemperatureRecords(startOfDay(subDays(now, 6)), endOfDay(now)),
      getTemperatureRecords(startOfDay(subDays(now, 29)), endOfDay(now)),
      getTemperatureRecords(startOfMonth(now), endOfDay(now)),
    ])
      .then(([, sevenDays, thirtyDays, month]) => {
        if (cancelled) return;
        setRecords7d(sevenDays);
        setRecords30d(thirtyDays);
        setRecordsMonth(month);
      })
      .catch(() => {
        if (!cancelled) showError('Impossible de charger les indicateurs temperatures');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadEquipment, getTemperatureRecords]);

  const trend = useMemo(() => computeComplianceTrend(records7d, 7), [records7d]);
  const breakdown = useMemo(() => computeEquipmentBreakdown(records30d, equipment, 30), [records30d, equipment]);

  const overallCompliance7d =
    records7d.length > 0 ? Math.round((records7d.filter((row) => row.isCompliant).length / records7d.length) * 100) : 0;
  const anomaliesMonth = recordsMonth.filter((row) => !row.isCompliant).length;

  const worstEquipment = breakdown[0];
  const worstEquipmentLabel =
    worstEquipment && worstEquipment.anomalyCount > 0 ? worstEquipment.equipmentName : 'RAS';

  const consecutiveOkDays = useMemo(() => {
    let streak = 0;
    for (let i = trend.length - 1; i >= 0; i -= 1) {
      if (trend[i]?.rate === 100) streak += 1;
      else break;
    }
    return streak;
  }, [trend]);

  const kpiItems: AnalyticsKpiItem[] = [
    {
      label: 'Compliance 7j',
      value: `${overallCompliance7d}%`,
      color:
        overallCompliance7d >= 95
          ? 'var(--app-success)'
          : overallCompliance7d >= 80
            ? 'var(--app-warning)'
            : 'var(--app-danger)',
    },
    {
      label: 'Anomalies ce mois',
      value: anomaliesMonth,
      color: anomaliesMonth > 0 ? 'var(--app-danger)' : 'var(--app-success)',
    },
    {
      label: 'Pire equipement',
      value: worstEquipmentLabel,
      sub: worstEquipment ? `${worstEquipment.anomalyCount} anomalies / 30j` : '0 anomalies',
    },
    {
      label: 'Jours consecutifs OK',
      value: consecutiveOkDays,
      sub: 'A 100% compliant',
      color: consecutiveOkDays >= 3 ? 'var(--app-success)' : undefined,
    },
  ];

  return (
    <section className="glass-card glass-panel space-y-4 animate-fade-in-up">
      <div>
        <h2 className="ios-title3 app-text">Temperatures</h2>
        <p className="ios-caption app-muted">Tendance de compliance et performance par equipement.</p>
      </div>

      <AnalyticsKpiRow items={kpiItems} />

      <div className="app-card p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="ios-caption-upper">Tendance compliance 7 jours</h3>
          {loading && <span className="ios-small app-muted">Chargement...</span>}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--app-muted)' }} />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'var(--app-muted)' }}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                borderRadius: '10px',
                fontSize: '13px',
                color: 'var(--app-text)',
              }}
              formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Compliance']}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="var(--app-success)"
              fill="var(--app-success)"
              fillOpacity={0.15}
              strokeWidth={2.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        <h3 className="ios-caption-upper">Breakdown equipements (30 jours)</h3>
        {breakdown.length === 0 ? (
          <p className="dash-empty-inline">Aucun equipement disponible.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {breakdown.map((item) => {
              const tone =
                item.complianceRate >= 95
                  ? 'app-success-bg'
                  : item.complianceRate >= 80
                    ? 'app-warning-bg'
                    : 'app-danger-bg';

              return (
                <div key={item.equipmentId} className="app-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[14px] font-semibold app-text truncate">{item.equipmentName}</p>
                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', tone)}>
                      {item.complianceRate}%
                    </span>
                  </div>
                  <p className="ios-small app-muted">
                    Derniere temperature:{' '}
                    {item.lastTemperature === null ? 'n/a' : `${item.lastTemperature.toFixed(1)}C`}
                  </p>
                  <p className="ios-small app-muted">
                    Derniere mesure:{' '}
                    {item.lastTimestamp ? format(item.lastTimestamp, 'dd/MM HH:mm', { locale: fr }) : 'n/a'}
                  </p>
                  <p className="ios-small app-muted">{item.anomalyCount} anomalies / {item.totalRecords} mesures</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
