import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { PriceHistory } from '../../types';
import { cn, formatDateShort, generateSupplierColor } from '../../utils';
import { Skeleton } from '../common/Skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PriceTracker() {
  const [priceData, setPriceData] = useState<PriceHistory[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'avg' | 'max' | 'variation'>('name');
  const [selectedItem, setSelectedItem] = useState<PriceHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const getPriceHistory = useAppStore(s => s.getPriceHistory);
  const settings = useAppStore(s => s.settings);
  const threshold = settings?.priceAlertThreshold ?? 10;

  useEffect(() => {
    getPriceHistory()
      .then(data => {
        setPriceData(data);
      })
      .catch(() => showError('Impossible de charger le cadencier de prix'))
      .finally(() => setLoading(false));
  }, [getPriceHistory]);

  const filtered = useMemo(() => {
    let data = priceData;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(p =>
        p.itemName.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q)
      );
    }

    return [...data].sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.itemName.localeCompare(b.itemName);
        case 'avg': return b.averagePrice - a.averagePrice;
        case 'max': return b.maxPrice - a.maxPrice;
        case 'variation': {
          const varA = a.maxPrice > 0 ? ((a.maxPrice - a.minPrice) / a.averagePrice) * 100 : 0;
          const varB = b.maxPrice > 0 ? ((b.maxPrice - b.minPrice) / b.averagePrice) * 100 : 0;
          return varB - varA;
        }
        default: return 0;
      }
    });
  }, [priceData, search, sortBy]);

  const getVariation = (item: PriceHistory) => {
    if (item.averagePrice === 0) return 0;
    return Math.round(((item.maxPrice - item.minPrice) / item.averagePrice) * 100);
  };

  const itemNames = useMemo(() => {
    const names = new Set(priceData.map(p => p.itemName.toLowerCase()));
    return names;
  }, [priceData]);

  const hasDuplicateItem = (item: PriceHistory) => {
    return priceData.filter(p => p.itemName.toLowerCase() === item.itemName.toLowerCase()).length > 1;
  };

  if (selectedItem) {
    return <PriceChart item={selectedItem} onBack={() => setSelectedItem(null)} />;
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">Cadencier de prix</h2>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un article ou fournisseur"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-sm text-[#1d1d1f] dark:text-[#f5f5f7]"
        />
      </div>

      {/* Sort buttons */}
      <div className="flex gap-1 overflow-x-auto">
        {([
          { key: 'name', label: 'Nom' },
          { key: 'avg', label: 'Prix moy.' },
          { key: 'max', label: 'Prix max' },
          { key: 'variation', label: 'Variation' },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
              sortBy === opt.key
                ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'border-[#e8e8ed] dark:border-[#38383a] text-[#86868b] dark:text-[#86868b]'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-[#1d1d1f] border border-[#e8e8ed] dark:border-[#38383a]">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-16 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-[#86868b] dark:text-[#86868b]">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <p className="text-sm">Aucune donnée de prix</p>
          <p className="text-xs mt-1">Les prix apparaîtront après l'ajout de factures</p>
        </div>
      )}

      {/* Price table as cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(item => {
            const variation = getVariation(item);
            const isAlert = variation > threshold;
            const isDuplicate = hasDuplicateItem(item);

            return (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-colors active:scale-[0.98]',
                  isAlert
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-white dark:bg-[#1d1d1f] border-[#e8e8ed] dark:border-[#38383a]',
                  isDuplicate && 'ring-1 ring-blue-300 dark:ring-blue-700'
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{item.itemName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: generateSupplierColor(item.supplier) }} />
                      <span className="text-xs text-[#86868b] dark:text-[#86868b]">{item.supplier}</span>
                    </div>
                  </div>
                  {isAlert && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-[#ff3b30] font-medium">
                      ⚠ {variation}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                  <div>
                    <span className="text-[#86868b]">Moy.</span>
                    <p className="font-medium text-[#1d1d1f] dark:text-[#86868b]">{item.averagePrice.toFixed(2)}€</p>
                  </div>
                  <div>
                    <span className="text-[#86868b]">Min</span>
                    <p className="font-medium text-green-600 dark:text-green-400">{item.minPrice.toFixed(2)}€</p>
                  </div>
                  <div>
                    <span className="text-[#86868b]">Max</span>
                    <p className="font-medium text-red-600 dark:text-[#ff3b30]">{item.maxPrice.toFixed(2)}€</p>
                  </div>
                  <div>
                    <span className="text-[#86868b]">Entrées</span>
                    <p className="font-medium text-[#1d1d1f] dark:text-[#86868b]">{item.prices.length}</p>
                  </div>
                </div>
                {item.prices.length > 0 && (
                  <p className="text-[10px] text-[#86868b] mt-1">
                    Dernier : {formatDateShort(item.prices[item.prices.length - 1].date)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriceChart({ item, onBack }: { item: PriceHistory; onBack: () => void }) {
  const chartData = useMemo(() => {
    return item.prices
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(p => ({
        date: format(new Date(p.date), 'dd/MM', { locale: fr }),
        price: p.price,
      }));
  }, [item.prices]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-[#86868b] dark:text-[#86868b]">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h3 className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{item.itemName}</h3>
          <p className="text-xs text-[#86868b]">{item.supplier}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#1d1d1f] rounded-xl p-3 border border-[#e8e8ed] dark:border-[#38383a] text-center">
          <p className="text-xs text-[#86868b]">Moy.</p>
          <p className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">{item.averagePrice.toFixed(2)}€</p>
        </div>
        <div className="bg-white dark:bg-[#1d1d1f] rounded-xl p-3 border border-[#e8e8ed] dark:border-[#38383a] text-center">
          <p className="text-xs text-[#86868b]">Min</p>
          <p className="text-lg font-bold text-green-600">{item.minPrice.toFixed(2)}€</p>
        </div>
        <div className="bg-white dark:bg-[#1d1d1f] rounded-xl p-3 border border-[#e8e8ed] dark:border-[#38383a] text-center">
          <p className="text-xs text-[#86868b]">Max</p>
          <p className="text-lg font-bold text-red-600">{item.maxPrice.toFixed(2)}€</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 ? (
        <div className="bg-white dark:bg-[#1d1d1f] rounded-xl p-4 border border-[#e8e8ed] dark:border-[#38383a]">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" unit="€" />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, backgroundColor: '#fff', borderColor: '#e5e7eb' }}
                formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}€`, 'Prix']}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-8 text-[#86868b] text-sm">
          Pas assez de données pour afficher un graphique
        </div>
      )}

      {/* Price history list */}
      <div className="bg-white dark:bg-[#1d1d1f] rounded-xl border border-[#e8e8ed] dark:border-[#38383a] overflow-hidden">
        <div className="p-3 border-b border-[#e8e8ed] dark:border-[#38383a]">
          <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#86868b]">Historique des prix</h4>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {item.prices
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((p, i) => (
              <div key={i} className="flex justify-between items-center p-3">
                <span className="text-sm text-[#86868b] dark:text-[#86868b]">{formatDateShort(p.date)}</span>
                <span className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{p.price.toFixed(2)}€</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
