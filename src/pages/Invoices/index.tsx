import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { Invoice } from '../../types';
import { cn, vibrate } from '../../utils';
import { showError } from '../../stores/toastStore';
import InvoiceScanner from '../../components/invoices/InvoiceScanner';
import InvoiceGallery from '../../components/invoices/InvoiceGallery';

const PriceTracker = lazy(() => import('../../components/invoices/PriceTracker'));

type SubTab = 'scanner' | 'factures' | 'cadencier';

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

  const getInvoices = useAppStore((s) => s.getInvoices);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInvoices();
      setInvoices(data);
    } catch {
      showError('Impossible de charger les factures');
    } finally {
      setLoading(false);
    }
  }, [getInvoices]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const handleTabChange = (tab: SubTab) => {
    vibrate();
    setActiveSubTab(tab);
  };

  const handleScanComplete = () => {
    loadInvoices();
    setActiveSubTab('factures');
  };

  const handleFabClick = () => {
    vibrate();
    setActiveSubTab('scanner');
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] dark:bg-black">
      {/* iOS Segmented Control */}
      <div className="px-4 pt-4 pb-3">
        <div className="ios-segmented">
          {TAB_CONFIG.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={cn('ios-segmented-item', activeSubTab === key && 'active')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto relative">
        {activeSubTab === 'scanner' && (
          <InvoiceScanner onComplete={handleScanComplete} />
        )}
        {activeSubTab === 'factures' && (
          <InvoiceGallery
            invoices={invoices}
            loading={loading}
            onRefresh={loadInvoices}
          />
        )}
        {activeSubTab === 'cadencier' && (
          <Suspense fallback={<div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-[#2997FF] dark:border-[#2997FF] border-t-transparent rounded-full animate-spin" /></div>}>
            <PriceTracker />
          </Suspense>
        )}
      </div>

      {/* Floating action button */}
      {activeSubTab !== 'scanner' && (
        <button
          onClick={handleFabClick}
          className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-[#2997FF] text-white shadow-lg shadow-[#2997FF]/30 dark:shadow-[#2997FF]/30 flex items-center justify-center active:opacity-70 transition-opacity"
          aria-label="Scanner une facture"
        >
          <PlusIcon />
        </button>
      )}
    </div>
  );
}
