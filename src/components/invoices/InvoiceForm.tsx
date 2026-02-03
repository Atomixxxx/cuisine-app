import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { OCRResult } from '../../services/ocr';
import type { Invoice, InvoiceItem } from '../../types';
import { cn, vibrate } from '../../utils';

interface InvoiceFormProps {
  initialData: OCRResult;
  images: Blob[];
  onSave: () => void;
  onCancel: () => void;
  existingInvoice?: Invoice;
}

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

export default function InvoiceForm({
  initialData,
  images,
  onSave,
  onCancel,
  existingInvoice,
}: InvoiceFormProps) {
  const [supplier, setSupplier] = useState(
    existingInvoice?.supplier ?? initialData.supplier
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    existingInvoice?.invoiceNumber ?? initialData.invoiceNumber
  );
  const [invoiceDate, setInvoiceDate] = useState(() => {
    if (existingInvoice?.invoiceDate) {
      const d = new Date(existingInvoice.invoiceDate);
      return d.toISOString().split('T')[0];
    }
    return initialData.invoiceDate || new Date().toISOString().split('T')[0];
  });
  const [items, setItems] = useState<InvoiceItem[]>(
    existingInvoice?.items ?? initialData.items.length > 0
      ? (existingInvoice?.items ?? initialData.items)
      : [{ designation: '', quantity: 1, unitPriceHT: 0, totalPriceHT: 0 }]
  );
  const [tagsInput, setTagsInput] = useState(
    existingInvoice?.tags?.join(', ') ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addInvoice = useAppStore((s) => s.addInvoice);
  const updateInvoice = useAppStore((s) => s.updateInvoice);
  const updatePriceHistory = useAppStore((s) => s.updatePriceHistory);

  const totals = useMemo(() => {
    const totalHT = items.reduce((sum, item) => sum + (item.totalPriceHT || 0), 0);
    const totalTVA = Math.round(totalHT * 0.2 * 100) / 100;
    const totalTTC = Math.round((totalHT + totalTVA) * 100) / 100;
    return {
      totalHT: Math.round(totalHT * 100) / 100,
      totalTVA,
      totalTTC,
    };
  }, [items]);

  const handleItemChange = useCallback(
    (index: number, field: keyof InvoiceItem, value: string | number) => {
      setItems((prev) => {
        const updated = [...prev];
        const item = { ...updated[index] };

        if (field === 'designation') {
          item.designation = value as string;
        } else {
          const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;
          if (field === 'quantity') {
            item.quantity = numVal;
            item.totalPriceHT = Math.round(numVal * item.unitPriceHT * 100) / 100;
          } else if (field === 'unitPriceHT') {
            item.unitPriceHT = numVal;
            item.totalPriceHT = Math.round(item.quantity * numVal * 100) / 100;
          } else if (field === 'totalPriceHT') {
            item.totalPriceHT = numVal;
          }
        }

        updated[index] = item;
        return updated;
      });
    },
    []
  );

  const handleAddItem = useCallback(() => {
    vibrate();
    setItems((prev) => [
      ...prev,
      { designation: '', quantity: 1, unitPriceHT: 0, totalPriceHT: 0 },
    ]);
  }, []);

  const handleRemoveItem = useCallback((index: number) => {
    vibrate();
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!supplier.trim()) {
      setError('Le fournisseur est requis');
      return;
    }
    if (items.length === 0 || !items.some((it) => it.designation.trim())) {
      setError('Au moins un article est requis');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const invoice: Invoice = {
        id: existingInvoice?.id ?? crypto.randomUUID(),
        images,
        supplier: supplier.trim(),
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(invoiceDate),
        items: items.filter((it) => it.designation.trim()),
        totalHT: totals.totalHT,
        totalTVA: totals.totalTVA,
        totalTTC: totals.totalTTC,
        ocrText: initialData.text,
        tags,
        scannedAt: existingInvoice?.scannedAt ?? new Date(),
      };

      if (existingInvoice) {
        await updateInvoice(invoice);
      } else {
        await addInvoice(invoice);
      }

      await updatePriceHistory(invoice);
      onSave();
    } catch (err) {
      console.error('Save error:', err);
      setError('Erreur lors de la sauvegarde. Veuillez reessayer.');
    } finally {
      setSaving(false);
    }
  }, [
    supplier,
    invoiceNumber,
    invoiceDate,
    items,
    tagsInput,
    images,
    initialData.text,
    totals,
    existingInvoice,
    addInvoice,
    updateInvoice,
    updatePriceHistory,
    onSave,
  ]);

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
          {existingInvoice ? 'Modifier la facture' : 'Verifier les donnees'}
        </h2>
        <button
          onClick={onCancel}
          className="text-sm text-[#86868b] dark:text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#86868b]"
        >
          Retour
        </button>
      </div>

      {/* Info note */}
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
        Verifiez et corrigez les informations extraites par l'OCR avant de sauvegarder.
      </div>

      {/* Supplier, invoice number, date */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[#86868b] dark:text-[#86868b] mb-1">
            Fournisseur *
          </label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-2 focus:ring-[#2997FF] focus:border-transparent"
            placeholder="Nom du fournisseur"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#86868b] dark:text-[#86868b] mb-1">
              N. facture
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-2 focus:ring-[#2997FF] focus:border-transparent"
              placeholder="FA-2024-001"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#86868b] dark:text-[#86868b] mb-1">
              Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-2 focus:ring-[#2997FF] focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#86868b]">
            Articles
          </h3>
          <button
            onClick={handleAddItem}
            className="flex items-center gap-1 text-xs text-[#2997FF] dark:text-[#2997FF] hover:text-blue-700"
          >
            <PlusIcon />
            Ajouter
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={index}
              className="p-3 rounded-lg border border-[#e8e8ed] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] space-y-2"
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={item.designation}
                  onChange={(e) =>
                    handleItemChange(index, 'designation', e.target.value)
                  }
                  className="flex-1 px-2 py-1.5 rounded border border-[#e8e8ed] dark:border-[#38383a] bg-[#f5f5f7] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-1 focus:ring-[#2997FF]"
                  placeholder="Designation"
                />
                <button
                  onClick={() => handleRemoveItem(index)}
                  disabled={items.length <= 1}
                  aria-label={`Supprimer l'article ${item.designation || index + 1}`}
                  className={cn(
                    'p-1.5 rounded text-[#ff3b30] active:opacity-70 dark:active:opacity-70',
                    items.length <= 1 && 'opacity-30 cursor-not-allowed'
                  )}
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-[#86868b] dark:text-[#86868b] mb-0.5">
                    Quantite
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(index, 'quantity', e.target.value)
                    }
                    className="w-full px-2 py-1.5 rounded border border-[#e8e8ed] dark:border-[#38383a] bg-[#f5f5f7] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-1 focus:ring-[#2997FF]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#86868b] dark:text-[#86868b] mb-0.5">
                    Prix unit. HT
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPriceHT}
                    onChange={(e) =>
                      handleItemChange(index, 'unitPriceHT', e.target.value)
                    }
                    className="w-full px-2 py-1.5 rounded border border-[#e8e8ed] dark:border-[#38383a] bg-[#f5f5f7] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-1 focus:ring-[#2997FF]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#86868b] dark:text-[#86868b] mb-0.5">
                    Total HT
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.totalPriceHT}
                    onChange={(e) =>
                      handleItemChange(index, 'totalPriceHT', e.target.value)
                    }
                    className="w-full px-2 py-1.5 rounded border border-[#e8e8ed] dark:border-[#38383a] bg-[#f5f5f7] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-1 focus:ring-[#2997FF]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="p-3 rounded-lg bg-[#e8e8ed] dark:bg-[#1d1d1f] space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-[#86868b] dark:text-[#86868b]">Total HT</span>
          <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
            {totals.totalHT.toFixed(2)} EUR
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#86868b] dark:text-[#86868b]">TVA (20%)</span>
          <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
            {totals.totalTVA.toFixed(2)} EUR
          </span>
        </div>
        <div className="flex justify-between text-sm font-bold border-t border-[#d1d1d6] dark:border-[#38383a] pt-1.5">
          <span className="text-[#1d1d1f] dark:text-[#f5f5f7]">Total TTC</span>
          <span className="text-[#2997FF] dark:text-[#2997FF]">
            {totals.totalTTC.toFixed(2)} EUR
          </span>
        </div>
      </div>

      {/* OCR Raw Text (collapsible) */}
      <details className="group">
        <summary className="text-xs font-medium text-[#86868b] dark:text-[#86868b] cursor-pointer hover:text-[#1d1d1f] dark:hover:text-[#86868b]">
          Voir le texte OCR brut
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-[#e8e8ed] dark:bg-[#1d1d1f] border border-[#e8e8ed] dark:border-[#38383a] text-[11px] text-[#86868b] dark:text-[#86868b] overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
          {initialData.text}
        </pre>
      </details>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-[#86868b] dark:text-[#86868b] mb-1">
          Tags (séparés par des virgules)
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[#d1d1d6] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] text-sm focus:ring-2 focus:ring-[#2997FF] focus:border-transparent"
          placeholder="viande, poisson, legumes..."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-3 px-4 rounded-xl border border-[#d1d1d6] dark:border-[#38383a] text-[#1d1d1f] dark:text-[#86868b] font-medium text-sm hover:bg-[#f5f5f7] dark:hover:bg-[#38383a] transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'flex-1 py-3 px-4 rounded-xl bg-[#2997FF] hover:bg-[#2997FF] text-white font-medium text-sm transition-colors flex items-center justify-center gap-2',
            saving && 'opacity-70 cursor-not-allowed'
          )}
        >
          {saving && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}
