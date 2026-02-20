import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError, showSuccess } from '../../stores/toastStore';
import type { Invoice } from '../../types';
import { formatDateShort, blobToUrl, generateSupplierColor, sanitizeInput } from '../../utils';
import { buildSupplierQuickPicks, canonicalizeSupplierName } from '../../services/suppliers';
import InvoiceForm from './InvoiceForm';
import type { OCRResult } from '../../services/ocr';

interface InvoiceDetailProps {
  invoice: Invoice;
  onClose: () => void;
}

export default function InvoiceDetail({ invoice, onClose }: InvoiceDetailProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const deleteInvoice = useAppStore((s) => s.deleteInvoice);
  const updateInvoice = useAppStore((s) => s.updateInvoice);
  const rebuildPriceHistory = useAppStore((s) => s.rebuildPriceHistory);
  const getInvoices = useAppStore((s) => s.getInvoices);
  const getPriceHistory = useAppStore((s) => s.getPriceHistory);

  useEffect(() => {
    if (!reassigning) return;
    const load = async () => {
      try {
        const [invoices, history] = await Promise.all([getInvoices(), getPriceHistory()]);
        const dynamic = [
          ...invoices.map((inv) => inv.supplier),
          ...history.map((h) => h.supplier),
        ].map((v) => v.trim()).filter(Boolean);
        setKnownSuppliers(dynamic);
      } catch {
        // non-blocking
      }
    };
    void load();
  }, [reassigning, getInvoices, getPriceHistory]);

  const supplierQuickPicks = useMemo(() => buildSupplierQuickPicks(knownSuppliers), [knownSuppliers]);
  const canonicalNew = useMemo(() => canonicalizeSupplierName(newSupplier.trim()), [newSupplier]);

  const handleOpenReassign = useCallback(() => {
    setNewSupplier(invoice.supplier);
    setReassigning(true);
  }, [invoice.supplier]);

  const handleReassignSave = useCallback(async () => {
    const target = (canonicalNew || newSupplier.trim());
    if (!target) return;
    setSavingSupplier(true);
    try {
      await updateInvoice({ ...invoice, supplier: target });
      await rebuildPriceHistory();
      showSuccess(`Fournisseur mis a jour : ${target}`);
      setReassigning(false);
      onClose();
    } catch {
      showError('Impossible de modifier le fournisseur');
    } finally {
      setSavingSupplier(false);
    }
  }, [canonicalNew, newSupplier, invoice, updateInvoice, rebuildPriceHistory, onClose]);

  const imageUrls = useMemo(() => {
    const blobUrls = (invoice.images ?? [])
      .map((img) => (img instanceof Blob ? blobToUrl(img) : ''))
      .filter(Boolean);
    if (blobUrls.length > 0) return blobUrls;
    return invoice.imageUrls ?? [];
  }, [invoice.images, invoice.imageUrls]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteInvoice(invoice.id);
      onClose();
    } catch {
      showError('Impossible de supprimer la facture');
    }
  }, [deleteInvoice, invoice.id, onClose]);

  if (editing) {
    const ocrData: OCRResult = {
      text: invoice.ocrText,
      supplier: invoice.supplier,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: new Date(invoice.invoiceDate).toISOString().split('T')[0],
      items: invoice.items,
      totalHT: invoice.totalHT,
      totalTVA: invoice.totalTVA,
      totalTTC: invoice.totalTTC,
    };
    return (
      <InvoiceForm
        initialData={ocrData}
        images={invoice.images}
        existingInvoice={invoice}
        onSave={() => {
          setEditing(false);
          onClose();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full app-bg app-page-wrap pb-24">
      <div className="glass-card glass-hero">
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl app-surface-2 app-muted active:opacity-70" aria-label="Retour">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold app-text">Detail facture</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl app-surface-2 text-[color:var(--app-accent)]" aria-label="Modifier">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => setConfirmDelete(true)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl app-surface-2 text-[color:var(--app-danger)]" aria-label="Supprimer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="3,6 5,6 21,6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-3">
        {imageUrls.length > 0 && (
          <div className="glass-card glass-panel overflow-hidden">
            <div className="relative overflow-hidden app-surface-2" style={{ minHeight: 200 }}>
              <img
                src={imageUrls[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className="w-full object-contain transition-transform"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              />
            </div>
            {imageUrls.length > 1 && (
              <div className="flex items-center justify-center gap-3 p-2 border-t app-border">
                <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="p-1 app-muted disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs app-muted">
                  {currentPage + 1} / {imageUrls.length}
                </span>
                <button onClick={() => setCurrentPage((p) => Math.min(imageUrls.length - 1, p + 1))} disabled={currentPage === imageUrls.length - 1} className="p-1 app-muted disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex justify-center gap-2 pb-2">
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="px-2 py-1 text-xs rounded app-surface-2 app-border app-muted">
                -
              </button>
              <span className="px-2 py-1 text-xs app-muted">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="px-2 py-1 text-xs rounded app-surface-2 app-border app-muted">
                +
              </button>
              <button onClick={() => setZoom(1)} className="px-2 py-1 text-xs rounded app-surface-2 app-border app-muted">
                Reset
              </button>
            </div>
          </div>
        )}

        <div className="glass-card glass-panel space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: generateSupplierColor(invoice.supplier || '') }} />
              <h3 className="font-semibold app-text truncate">{invoice.supplier || 'Fournisseur inconnu'}</h3>
            </div>
            <button
              onClick={handleOpenReassign}
              className="shrink-0 px-2.5 py-1 rounded-lg app-surface-2 ios-caption font-semibold text-[color:var(--app-accent)] active:opacity-70 transition-opacity"
            >
              Changer
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs app-muted">No facture</span>
              <p className="app-text">{invoice.invoiceNumber || '-'}</p>
            </div>
            <div>
              <span className="text-xs app-muted">Date</span>
              <p className="app-text">{formatDateShort(invoice.invoiceDate)}</p>
            </div>
          </div>
        </div>

        {invoice.items.length > 0 && (
          <div className="glass-card glass-panel overflow-hidden">
            <div className="p-3 border-b app-border">
              <h4 className="text-sm font-semibold app-text">Articles ({invoice.items.length})</h4>
            </div>
            <div className="divide-y divide-[color:var(--app-border)]">
              {invoice.items.map((item, i) => (
                <div key={i} className="p-3 flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm app-text truncate">{item.designation}</p>
                    <p className="text-xs app-muted">
                      {item.quantity} x {item.unitPriceHT.toFixed(2)} EUR
                    </p>
                  </div>
                  <span className="text-sm font-medium app-text ml-3">{item.totalPriceHT.toFixed(2)} EUR</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-card glass-panel space-y-2">
          <div className="flex justify-between text-sm">
            <span className="app-muted">Total HT</span>
            <span className="app-text">{invoice.totalHT.toFixed(2)} EUR</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="app-muted">TVA</span>
            <span className="app-text">{invoice.totalTVA.toFixed(2)} EUR</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t app-border pt-2">
            <span className="app-text">Total TTC</span>
            <span className="text-[color:var(--app-accent)]">{invoice.totalTTC.toFixed(2)} EUR</span>
          </div>
        </div>

        {invoice.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {invoice.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 text-xs rounded-full app-chip">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="glass-card glass-panel p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold app-text">Supprimer cette facture ?</h3>
            <p className="text-sm app-muted">Cette action est irreversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl app-surface-2 app-border app-text text-sm font-medium">
                Annuler
              </button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-xl app-danger-bg text-sm font-medium">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {reassigning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="glass-card glass-panel p-5 w-full max-w-sm space-y-4">
            <h3 className="text-base font-bold app-text">Changer de fournisseur</h3>
            <p className="text-xs app-muted">
              Fournisseur actuel : <span className="font-semibold app-text">{invoice.supplier || 'Inconnu'}</span>
            </p>

            <div>
              <label className="block text-xs font-medium app-muted mb-1">Nouveau fournisseur</label>
              <input
                type="text"
                value={newSupplier}
                onChange={(e) => setNewSupplier(sanitizeInput(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border app-border app-surface app-text text-sm focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent"
                placeholder="Nom du fournisseur"
                autoFocus
              />
              {canonicalNew && canonicalNew !== newSupplier.trim() && (
                <button
                  type="button"
                  onClick={() => setNewSupplier(canonicalNew)}
                  className="mt-1 text-xs font-semibold text-[color:var(--app-accent)] active:opacity-70"
                >
                  Utiliser : {canonicalNew}
                </button>
              )}
            </div>

            {supplierQuickPicks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {supplierQuickPicks.map((pick) => (
                  <button
                    key={pick}
                    type="button"
                    onClick={() => setNewSupplier(pick)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold active:opacity-70 transition-opacity ${
                      (canonicalNew || newSupplier.trim()).toLowerCase() === pick.toLowerCase()
                        ? 'app-accent-bg'
                        : 'app-surface-2 app-text'
                    }`}
                  >
                    {pick}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setReassigning(false)}
                disabled={savingSupplier}
                className="flex-1 py-2.5 rounded-xl app-surface-2 app-border app-text text-sm font-medium active:opacity-70"
              >
                Annuler
              </button>
              <button
                onClick={handleReassignSave}
                disabled={savingSupplier || !(canonicalNew || newSupplier.trim())}
                className="flex-1 py-2.5 rounded-xl app-accent-bg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingSupplier && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {savingSupplier ? 'Sauvegarde...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

