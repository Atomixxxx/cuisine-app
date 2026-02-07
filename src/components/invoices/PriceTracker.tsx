import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { PriceHistory } from '../../types';
import { cn, formatDateShort, generateSupplierColor } from '../../utils';
import { Skeleton } from '../common/Skeleton';

type SortOption = 'name' | 'avg' | 'max' | 'variation' | 'entries';

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'name', label: 'Nom' },
  { key: 'avg', label: 'Prix moyen' },
  { key: 'max', label: 'Prix max' },
  { key: 'variation', label: 'Variation' },
  { key: 'entries', label: 'Entrees' },
];

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getVariation(item: PriceHistory): number {
  if (item.averagePrice <= 0) return 0;
  return Math.round(((item.maxPrice - item.minPrice) / item.averagePrice) * 100);
}

function formatMoney(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

function getLastEntryDate(item: PriceHistory): Date | null {
  if (item.prices.length === 0) return null;
  return item.prices.reduce((latest, current) =>
    new Date(current.date).getTime() > new Date(latest.date).getTime() ? current : latest
  ).date;
}

export default function PriceTracker() {
  const [priceData, setPriceData] = useState<PriceHistory[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('variation');
  const [selectedItem, setSelectedItem] = useState<PriceHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const getPriceHistory = useAppStore((s) => s.getPriceHistory);
  const settings = useAppStore((s) => s.settings);
  const threshold = settings?.priceAlertThreshold ?? 10;

  useEffect(() => {
    getPriceHistory()
      .then((data) => {
        setPriceData(data);
      })
      .catch(() => showError('Impossible de charger le cadencier de prix'))
      .finally(() => setLoading(false));
  }, [getPriceHistory]);

  const duplicateCountByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of priceData) {
      const key = normalizeLabel(item.itemName);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [priceData]);

  const filtered = useMemo(() => {
    let data = priceData;
    if (search) {
      const q = normalizeLabel(search);
      data = data.filter((item) =>
        normalizeLabel(item.itemName).includes(q) || normalizeLabel(item.supplier).includes(q),
      );
    }

    return [...data].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.itemName.localeCompare(b.itemName);
        case 'avg':
          return b.averagePrice - a.averagePrice;
        case 'max':
          return b.maxPrice - a.maxPrice;
        case 'entries':
          return b.prices.length - a.prices.length;
        case 'variation':
        default:
          return getVariation(b) - getVariation(a);
      }
    });
  }, [priceData, search, sortBy]);

  const overview = useMemo(() => {
    const total = filtered.length;
    const alerts = filtered.filter((item) => getVariation(item) > threshold).length;
    const avgVariation = total > 0
      ? Math.round(filtered.reduce((sum, item) => sum + getVariation(item), 0) / total)
      : 0;
    const multiSupplier = filtered.filter((item) => {
      const count = duplicateCountByName.get(normalizeLabel(item.itemName)) ?? 1;
      return count > 1;
    }).length;

    return { total, alerts, avgVariation, multiSupplier };
  }, [duplicateCountByName, filtered, threshold]);

  if (selectedItem) {
    return <PriceChart item={selectedItem} onBack={() => setSelectedItem(null)} threshold={threshold} />;
  }

  return (
    <div className="p-4 space-y-4">
      <section className="relative overflow-hidden rounded-2xl app-card p-4">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              'linear-gradient(135deg, rgba(41,151,255,0.14) 0%, rgba(14,165,233,0.10) 45%, rgba(52,199,89,0.08) 100%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <h2 className="text-[20px] font-semibold app-text">Cadencier prix</h2>
          <p className="text-[13px] app-muted mt-1">Suivi lisible des variations fournisseurs.</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <StatTile label="Articles" value={String(overview.total)} tone="info" />
            <StatTile label="Alertes" value={String(overview.alerts)} tone={overview.alerts > 0 ? 'danger' : 'success'} />
            <StatTile label="Var. moyenne" value={`${overview.avgVariation}%`} tone="warning" />
            <StatTile label="Multi fournisseurs" value={String(overview.multiSupplier)} tone="info" />
          </div>
        </div>
      </section>

      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher article ou fournisseur"
          className="w-full pl-9 pr-10 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded-lg app-muted active:opacity-70"
            aria-label="Effacer la recherche"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap border transition-colors active:opacity-75',
              sortBy === opt.key
                ? 'bg-[color:var(--app-accent-weak)] border-[color:var(--app-accent)] text-[color:var(--app-accent)]'
                : 'border-[color:var(--app-border)] app-surface app-muted',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="rounded-2xl app-card p-3.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 app-muted">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <p className="text-sm font-medium">Aucune donnee de prix</p>
          <p className="text-xs mt-1">Les donnees apparaitront apres ajout de factures</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((item) => {
            const variation = getVariation(item);
            const isAlert = variation > threshold;
            const duplicateCount = duplicateCountByName.get(normalizeLabel(item.itemName)) ?? 1;
            const hasMultipleSuppliers = duplicateCount > 1;
            const lastDate = getLastEntryDate(item);
            const rangePercent = item.maxPrice > 0
              ? Math.max(8, Math.round(((item.maxPrice - item.minPrice) / item.maxPrice) * 100))
              : 0;

            return (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={cn(
                  'w-full text-left rounded-2xl border p-3.5 transition-all active:scale-[0.99]',
                  isAlert
                    ? 'bg-[color:var(--app-danger)]/8 border-[color:var(--app-danger)]/35'
                    : 'app-card',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold app-text truncate">{item.itemName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: generateSupplierColor(item.supplier) }} />
                      <span className="text-[12px] app-muted truncate">{item.supplier}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[18px] font-bold app-text leading-none">{formatMoney(item.averagePrice)}</p>
                    <p className="text-[11px] app-muted mt-1">prix moyen</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-semibold',
                      isAlert
                        ? 'bg-[color:var(--app-danger)]/16 text-[color:var(--app-danger)]'
                        : 'bg-[color:var(--app-success)]/16 text-[color:var(--app-success)]',
                    )}
                  >
                    {variation >= 0 ? '+' : ''}{variation}%
                  </span>
                  {hasMultipleSuppliers && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[color:var(--app-accent)]/14 text-[color:var(--app-accent)]">
                      {duplicateCount} fournisseurs
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold app-surface-2 app-muted">
                    {item.prices.length} entrees
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-[color:var(--app-success)] font-semibold">min {formatMoney(item.minPrice)}</span>
                    <span className="text-[color:var(--app-danger)] font-semibold">max {formatMoney(item.maxPrice)}</span>
                  </div>
                  <div className="h-1.5 rounded-full app-surface-3 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', isAlert ? 'app-danger-bg' : 'app-accent-bg')}
                      style={{ width: `${rangePercent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] app-muted">
                  <span>Derniere maj: {lastDate ? formatDateShort(lastDate) : 'n/a'}</span>
                  <span className="font-semibold">Voir detail</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'info' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-[color:var(--app-danger)]'
      : tone === 'warning'
        ? 'text-[color:var(--app-warning)]'
        : tone === 'success'
          ? 'text-[color:var(--app-success)]'
          : 'text-[color:var(--app-info)]';

  return (
    <div className="rounded-xl app-surface/85 border app-border px-2.5 py-2">
      <p className="text-[11px] app-muted">{label}</p>
      <p className={cn('text-[16px] leading-none font-bold mt-1', toneClass)}>{value}</p>
    </div>
  );
}

function PriceChart({
  item,
  onBack,
  threshold,
}: {
  item: PriceHistory;
  onBack: () => void;
  threshold: number;
}) {
  const variation = getVariation(item);
  const isAlert = variation > threshold;

  const sortedAsc = useMemo(
    () => [...item.prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [item.prices],
  );

  const sortedDesc = useMemo(() => [...sortedAsc].reverse(), [sortedAsc]);

  const chartData = useMemo(
    () =>
      sortedAsc.map((price) => ({
        date: format(new Date(price.date), 'dd/MM', { locale: fr }),
        fullDate: formatDateShort(price.date),
        price: price.price,
      })),
    [sortedAsc],
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 app-muted active:opacity-70" aria-label="Retour cadencier">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h3 className="font-semibold app-text truncate">{item.itemName}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: generateSupplierColor(item.supplier) }} />
            <p className="text-xs app-muted truncate">{item.supplier}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatPanel label="Prix moyen" value={formatMoney(item.averagePrice)} tone="info" />
        <StatPanel label="Variation" value={`${variation}%`} tone={isAlert ? 'danger' : 'success'} />
        <StatPanel label="Prix mini" value={formatMoney(item.minPrice)} tone="success" />
        <StatPanel label="Prix maxi" value={formatMoney(item.maxPrice)} tone="danger" />
      </div>

      {chartData.length > 1 ? (
        <div className="rounded-2xl p-4 border app-border app-surface">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--app-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--app-muted)" />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  fontSize: 12,
                  backgroundColor: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
                formatter={(value: number | undefined) => [formatMoney(value ?? 0), 'Prix']}
              />
              <ReferenceLine y={item.averagePrice} stroke="var(--app-warning)" strokeDasharray="5 5" />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--app-accent)"
                strokeWidth={2.4}
                dot={{ fill: 'var(--app-accent)', r: 3.2 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-2xl app-surface p-6 text-center app-muted text-sm border app-border">
          Pas assez de donnees pour afficher un graphique.
        </div>
      )}

      <div className="rounded-2xl border app-border app-surface overflow-hidden">
        <div className="px-3.5 py-3 border-b app-border flex items-center justify-between">
          <h4 className="text-sm font-semibold app-text">Historique des prix</h4>
          <span className="text-[11px] app-muted">{sortedDesc.length} lignes</span>
        </div>
        <div className="divide-y divide-[color:var(--app-border)]">
          {sortedDesc.map((entry, index) => {
            const older = sortedDesc[index + 1];
            const diff = older ? entry.price - older.price : null;
            const diffClass = diff === null
              ? 'app-muted'
              : diff > 0
                ? 'text-[color:var(--app-danger)]'
                : diff < 0
                  ? 'text-[color:var(--app-success)]'
                  : 'app-muted';
            const diffLabel = diff === null ? '-' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)} EUR`;

            return (
              <div key={`${entry.date.toString()}-${index}`} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-sm app-muted">{formatDateShort(entry.date)}</span>
                <div className="text-right">
                  <div className="text-sm font-semibold app-text">{formatMoney(entry.price)}</div>
                  <div className={cn('text-[11px] font-medium', diffClass)}>{diffLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-[color:var(--app-danger)]'
      : tone === 'warning'
        ? 'text-[color:var(--app-warning)]'
        : tone === 'success'
          ? 'text-[color:var(--app-success)]'
          : 'text-[color:var(--app-accent)]';

  return (
    <div className="rounded-xl border app-border app-surface px-3 py-2.5">
      <p className="text-[11px] app-muted">{label}</p>
      <p className={cn('text-[17px] leading-none font-bold mt-1', toneClass)}>{value}</p>
    </div>
  );
}
