import { useState, useMemo, useEffect } from 'react';
import type { Invoice } from '../../types';
import { cn, formatDateShort, generateSupplierColor, blobToUrl } from '../../utils';
import InvoiceDetail from './InvoiceDetail';
import { InvoiceCardSkeleton, ListSkeleton } from '../common/Skeleton';

interface InvoiceGalleryProps {
  invoices: Invoice[];
  loading: boolean;
  onRefresh: () => void;
}

type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const SORT_LABELS: Record<SortOption, string> = {
  date_desc: 'Date (récent)',
  date_asc: 'Date (ancien)',
  amount_desc: 'Montant (décr.)',
  amount_asc: 'Montant (croiss.)',
};

export default function InvoiceGallery({ invoices, loading, onRefresh }: InvoiceGalleryProps) {
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [groupBySupplier, setGroupBySupplier] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const suppliers = useMemo(() => {
    const set = new Set(invoices.map(i => i.supplier).filter(Boolean));
    return Array.from(set).sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    let result = invoices.filter(inv => {
      if (supplierFilter && inv.supplier !== supplierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchText = [inv.supplier, inv.invoiceNumber, inv.ocrText, ...inv.tags]
          .join(' ')
          .toLowerCase();
        if (!matchText.includes(q)) return false;
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(inv.invoiceDate) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(inv.invoiceDate) > to) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc': return new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime();
        case 'date_asc': return new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime();
        case 'amount_desc': return b.totalTTC - a.totalTTC;
        case 'amount_asc': return a.totalTTC - b.totalTTC;
      }
    });

    return result;
  }, [invoices, search, supplierFilter, dateFrom, dateTo, sortBy]);

  const grouped = useMemo(() => {
    if (!groupBySupplier) return null;
    const map = new Map<string, Invoice[]>();
    filtered.forEach(inv => {
      const key = inv.supplier || 'Sans fournisseur';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    return map;
  }, [filtered, groupBySupplier]);

  if (selectedInvoice) {
    return (
      <InvoiceDetail
        invoice={selectedInvoice}
        onClose={() => { setSelectedInvoice(null); onRefresh(); }}
      />
    );
  }

  const inputClass = 'px-3 py-2.5 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF] dark:focus:ring-[#2997FF]';

  return (
    <div className="p-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (fournisseur, contenu...)"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF] dark:focus:ring-[#2997FF]"
        />
      </div>

      {/* Filters row */}
      <div className="flex gap-2 items-center">
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className={cn('flex-1', inputClass)}
        >
          <option value="">Tous les fournisseurs</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          className={inputClass}
        >
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          onClick={() => setGroupBySupplier(!groupBySupplier)}
          className={cn(
            'px-3 py-2.5 rounded-xl text-[13px] font-semibold shrink-0 active:opacity-70 transition-opacity',
            groupBySupplier
              ? 'bg-[#2997FF] text-white'
              : 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b]'
          )}
        >
          Grouper
        </button>
      </div>

      {/* Date range filter */}
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          placeholder="Du"
          className={cn('flex-1', inputClass)}
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          placeholder="Au"
          className={cn('flex-1', inputClass)}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#86868b] active:opacity-70"
            aria-label="Effacer les dates"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && <ListSkeleton count={4} Card={InvoiceCardSkeleton} />}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-16 h-16 text-[#d1d1d6] dark:text-[#38383a] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          <p className="ios-title3 text-[#86868b]">Aucune facture</p>
          <p className="text-[15px] text-[#86868b] mt-1">Scannez votre première facture</p>
        </div>
      )}

      {/* Invoice cards */}
      {!loading && !groupBySupplier && (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(inv => (
            <InvoiceCard key={inv.id} invoice={inv} onClick={() => setSelectedInvoice(inv)} />
          ))}
        </div>
      )}

      {/* Grouped view */}
      {!loading && groupBySupplier && grouped && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([supplier, invs]) => (
            <div key={supplier}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: generateSupplierColor(supplier) }}
                />
                <h3 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{supplier}</h3>
                <span className="text-[13px] text-[#86868b]">({invs.length})</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {invs.map(inv => (
                  <InvoiceCard key={inv.id} invoice={inv} onClick={() => setSelectedInvoice(inv)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvoiceCard({ invoice, onClick }: { invoice: Invoice; onClick: () => void }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (invoice.images && invoice.images.length > 0 && invoice.images[0] instanceof Blob) {
      const url = blobToUrl(invoice.images[0]);
      setThumbnailUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setThumbnailUrl(null);
  }, [invoice.images]);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#1d1d1f] ios-card-shadow text-left active:opacity-70 transition-opacity"
    >
      {/* Thumbnail */}
      <div className="w-14 h-18 rounded-xl overflow-hidden bg-[#e8e8ed] dark:bg-[#38383a] shrink-0 flex items-center justify-center">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <svg className="w-6 h-6 text-[#d1d1d6] dark:text-[#38383a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: generateSupplierColor(invoice.supplier || 'unknown') }}
          />
          <span className="text-[15px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
            {invoice.supplier || 'Fournisseur inconnu'}
          </span>
        </div>
        <p className="text-[13px] text-[#86868b]">
          {invoice.invoiceNumber && `N° ${invoice.invoiceNumber} · `}
          {formatDateShort(invoice.invoiceDate)}
        </p>
        {invoice.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {invoice.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b]">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Total */}
      <div className="text-right shrink-0">
        <span className="text-[17px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
          {invoice.totalTTC.toFixed(2)}€
        </span>
        <p className="text-[12px] text-[#86868b]">TTC</p>
      </div>
    </button>
  );
}
