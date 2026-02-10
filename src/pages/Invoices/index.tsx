import { useState, useEffect, useCallback, Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import type { Invoice } from '../../types';
import { cn, vibrate } from '../../utils';
import { showError } from '../../stores/toastStore';
import InvoiceScanner from '../../components/invoices/InvoiceScanner';
import InvoiceGallery from '../../components/invoices/InvoiceGallery';

const PriceTracker = lazy(() => import('../../components/invoices/PriceTracker'));

type SubTab = 'scanner' | 'factures' | 'cadencier';
const PAGE_SIZE = 30;

const TAB_CONFIG: { key: SubTab; label: string }[] = [
  { key: 'scanner', label: 'Scanner' },
  { key: 'factures', label: 'Factures' },
  { key: 'cadencier', label: 'Cadencier' },
];

const PlusIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 012-2h2" />
    <path d="M17 3h2a2 2 0 012 2v2" />
    <path d="M21 17v2a2 2 0 01-2 2h-2" />
    <path d="M7 21H5a2 2 0 01-2-2v-2" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

export default function InvoicesPage() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('factures');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const getInvoices = useAppStore((s) => s.getInvoices);

  const supplierCount = useMemo(() => new Set(invoices.map((invoice) => invoice.supplier).filter(Boolean)).size, [invoices]);

  const loadInitialInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInvoices({ limit: PAGE_SIZE, offset: 0 });
      setInvoices(data);
      setPage(1);
      setHasMoreInvoices(data.length === PAGE_SIZE);
    } catch {
      showError('Impossible de charger les factures');
    } finally {
      setLoading(false);
    }
  }, [getInvoices]);

  useEffect(() => {
    void loadInitialInvoices();
  }, [loadInitialInvoices]);

  const loadMoreInvoices = useCallback(async () => {
    if (loading || loadingMore || !hasMoreInvoices) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await getInvoices({
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      });
      setInvoices((prev) => [...prev, ...data]);
      setPage(nextPage);
      setHasMoreInvoices(data.length === PAGE_SIZE);
    } catch {
      showError('Impossible de charger plus de factures');
    } finally {
      setLoadingMore(false);
    }
  }, [getInvoices, hasMoreInvoices, loading, loadingMore, page]);

  useEffect(() => {
    const quick = searchParams.get('quick');
    if (!quick) return;

    if (quick === 'scan') {
      setActiveSubTab('scanner');
    } else if (quick === 'cadencier') {
      setActiveSubTab('cadencier');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('quick');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleTabChange = (tab: SubTab) => {
    vibrate();
    setActiveSubTab(tab);
  };

  const handleScanComplete = () => {
    void loadInitialInvoices();
    setActiveSubTab('factures');
  };

  const handleFabClick = () => {
    vibrate();
    setActiveSubTab('scanner');
  };

  return (
    <div className="app-page-wrap h-full pb-24">
      <div className="app-hero-card space-y-3 spx-scan-line">
        <div>
          <h1 className="ios-title app-text">Factures</h1>
          <p className="text-[11px] sm:text-[12px] app-muted">Scan OCR, historique et cadencier prix.</p>
        </div>
        <div className="app-kpi-grid">
          <div className="app-kpi-card">
            <p className="app-kpi-label">Factures chargees</p>
            <p className="app-kpi-value">{invoices.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Fournisseurs detectes</p>
            <p className="app-kpi-value">{supplierCount}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Pagination</p>
            <p className="app-kpi-value text-[13px] font-semibold">{hasMoreInvoices ? 'Disponible' : 'Fin'}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Mode</p>
            <p className="app-kpi-value text-[13px] font-semibold">{activeSubTab}</p>
          </div>
        </div>
      </div>

      <div className="ios-segmented">
        {TAB_CONFIG.map(({ key, label }) => (
          <button key={key} onClick={() => handleTabChange(key)} className={cn('ios-segmented-item', activeSubTab === key && 'active')}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto relative py-2">
        {activeSubTab === 'scanner' && <InvoiceScanner onComplete={handleScanComplete} />}

        {activeSubTab === 'factures' && (
          <div className="pb-4">
            <InvoiceGallery
              invoices={invoices}
              loading={loading}
              onRefresh={() => {
                void loadInitialInvoices();
              }}
            />
            {!loading && hasMoreInvoices && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => {
                    void loadMoreInvoices();
                  }}
                  disabled={loadingMore}
                  className={cn(
                    'px-4 py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70 transition-opacity',
                    loadingMore ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-surface-2 app-text',
                  )}
                >
                  {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'cadencier' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <PriceTracker />
          </Suspense>
        )}
      </div>

      {activeSubTab !== 'scanner' && (
        <button
          onClick={handleFabClick}
          className="fixed bottom-16 right-3 z-30 w-12 h-12 rounded-full app-accent-bg flex items-center justify-center active:opacity-70 transition-opacity spx-fab"
          aria-label="Scanner une facture"
        >
          <PlusIcon />
        </button>
      )}
    </div>
  );
}

