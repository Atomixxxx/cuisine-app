import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { Invoice, PriceHistory } from '../../types';
import AnalyticsKpiRow, { type AnalyticsKpiItem } from './AnalyticsKpiRow';
import { computeMonthInvoiceCount, computeMonthlySpend, computePriceVariation, computeTopVolatileItems } from '../../services/analyticsEngine';
import { cn } from '../../utils';

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export default function FinancialSection() {
  const getInvoices = useAppStore((s) => s.getInvoices);
  const getPriceHistory = useAppStore((s) => s.getPriceHistory);
  const settings = useAppStore((s) => s.settings);

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getInvoices(), getPriceHistory()])
      .then(([invoiceRows, historyRows]) => {
        if (cancelled) return;
        setInvoices(invoiceRows);
        setPriceHistory(historyRows);
      })
      .catch(() => {
        if (!cancelled) showError('Impossible de charger les indicateurs finances');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getInvoices, getPriceHistory]);

  const threshold = settings?.priceAlertThreshold ?? 10;
  const monthlySpend = useMemo(() => computeMonthlySpend(invoices, 6), [invoices]);
  const volatileItems = useMemo(
    () => computeTopVolatileItems(priceHistory, threshold, 5),
    [priceHistory, threshold],
  );

  const currentMonthSpend = monthlySpend[monthlySpend.length - 1]?.total ?? 0;
  const previousMonthSpend = monthlySpend[monthlySpend.length - 2]?.total ?? 0;
  const invoiceCountMonth = useMemo(() => computeMonthInvoiceCount(invoices), [invoices]);

  const kpiItems: AnalyticsKpiItem[] = useMemo(
    () => [
      {
        label: 'Depenses ce mois',
        value: formatEuro(currentMonthSpend),
        color: 'var(--app-accent)',
      },
      {
        label: 'Mois precedent',
        value: formatEuro(previousMonthSpend),
      },
      {
        label: 'Factures ce mois',
        value: invoiceCountMonth,
      },
      {
        label: 'Articles volatils',
        value: volatileItems.length,
        sub: `Seuil > ${threshold}%`,
        color: volatileItems.length > 0 ? 'var(--app-danger)' : 'var(--app-success)',
      },
    ],
    [currentMonthSpend, previousMonthSpend, invoiceCountMonth, volatileItems.length, threshold],
  );

  return (
    <section className="glass-card glass-panel space-y-4 animate-fade-in-up">
      <div>
        <h2 className="ios-title3 app-text">Finances</h2>
        <p className="ios-caption app-muted">Depenses fournisseurs et volatilite des prix.</p>
      </div>

      <AnalyticsKpiRow items={kpiItems} />

      <div className="app-card p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="ios-caption-upper">Depenses mensuelles (6 mois)</h3>
          {loading && <span className="ios-small app-muted">Chargement...</span>}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlySpend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--app-muted)' }} />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--app-muted)' }}
              tickFormatter={(value: number) => `${Math.round(value)} EUR`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                borderRadius: '10px',
                fontSize: '13px',
                color: 'var(--app-text)',
              }}
              formatter={(value: number | undefined) => [formatEuro(value ?? 0), 'Depenses HT']}
            />
            <Bar dataKey="total" fill="var(--app-accent)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        <h3 className="ios-caption-upper">Top 5 articles les plus volatils</h3>
        {volatileItems.length === 0 ? (
          <p className="dash-empty-inline">Aucun article au-dessus du seuil de volatilite.</p>
        ) : (
          <div className="space-y-2">
            {volatileItems.map((item) => {
              const variation = Math.round(computePriceVariation(item));
              const toneClass =
                variation > threshold
                  ? 'bg-[color:var(--app-danger)]/14 text-[color:var(--app-danger)]'
                  : 'bg-[color:var(--app-success)]/14 text-[color:var(--app-success)]';
              return (
                <div key={item.id} className="rounded-2xl app-card px-3 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold app-text truncate">{item.itemName}</p>
                    <p className="ios-small app-muted truncate">{item.supplier}</p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', toneClass)}>
                    +{variation}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
