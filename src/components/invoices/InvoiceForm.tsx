import { useState, useMemo, useCallback, useEffect } from 'react';
import { z } from 'zod';
import { useAppStore } from '../../stores/appStore';
import type { OCRResult } from '../../services/ocr';
import type { Invoice, InvoiceItem } from '../../types';
import { cn, sanitizeInput, vibrate } from '../../utils';
import { logger } from '../../services/logger';
import { buildSupplierQuickPicks, canonicalizeSupplierName, isNewSupplier } from '../../services/suppliers';
import { syncInvoiceToIngredients } from '../../services/invoiceIngredientSync';

interface InvoiceFormProps {
  initialData: OCRResult;
  images: Blob[];
  onSave: () => void;
  onCancel: () => void;
  existingInvoice?: Invoice;
}

const INVOICE_VAT_RATE = 0.055;

const invoiceItemSchema = z.object({
  designation: z.string().trim().min(1, 'La designation est requise'),
  quantity: z
    .number()
    .finite('Quantite invalide')
    .min(0, 'La quantite doit etre superieure ou egale a 0')
    .max(99999, 'La quantite doit etre inferieure ou egale a 99999'),
  unitPriceHT: z
    .number()
    .finite('Prix unitaire invalide')
    .min(0, 'Le prix unitaire doit etre superieur ou egal a 0')
    .max(99999, 'Le prix unitaire doit etre inferieur ou egal a 99999'),
  totalPriceHT: z
    .number()
    .finite('Total HT invalide')
    .min(0, 'Le total HT doit etre superieur ou egal a 0'),
  conditioningQuantity: z.number().positive('Le colisage doit etre positif').optional(),
});

const invoiceFormSchema = z.object({
  supplier: z.string().trim().min(1, 'Le fournisseur est requis'),
  invoiceDate: z
    .string()
    .trim()
    .min(1, 'La date de facture est requise')
    .refine((value) => Number.isFinite(new Date(value).getTime()), 'Date de facture invalide'),
  items: z.array(invoiceItemSchema).min(1, 'Au moins un article est requis'),
});

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
  type InvoiceFieldErrorKey = 'supplier' | 'invoiceDate' | 'items';
  const [supplier, setSupplier] = useState(
    sanitizeInput(existingInvoice?.supplier ?? initialData.supplier)
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    sanitizeInput(existingInvoice?.invoiceNumber ?? initialData.invoiceNumber)
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
      ? (existingInvoice?.items ?? initialData.items).map((item) => ({
          ...item,
          designation: sanitizeInput(item.designation),
        }))
      : [{ designation: '', quantity: 1, unitPriceHT: 0, totalPriceHT: 0 }]
  );
  const [tagsInput, setTagsInput] = useState(
    sanitizeInput(existingInvoice?.tags?.join(', ') ?? '')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<InvoiceFieldErrorKey, string>>>({});
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);

  const addInvoice = useAppStore((s) => s.addInvoice);
  const updateInvoice = useAppStore((s) => s.updateInvoice);
  const rebuildPriceHistory = useAppStore((s) => s.rebuildPriceHistory);
  const getInvoices = useAppStore((s) => s.getInvoices);
  const getPriceHistory = useAppStore((s) => s.getPriceHistory);
  const supplierFieldId = 'invoice-supplier';
  const numberFieldId = 'invoice-number';
  const dateFieldId = 'invoice-date';
  const tagsFieldId = 'invoice-tags';
  const supplierErrorId = 'invoice-supplier-error';
  const dateErrorId = 'invoice-date-error';
  const formErrorId = 'invoice-form-error';

  useEffect(() => {
    const loadKnownSuppliers = async () => {
      try {
        const [invoices, priceHistory] = await Promise.all([getInvoices(), getPriceHistory()]);
        const dynamic = [
          ...invoices.map((invoice) => invoice.supplier),
          ...priceHistory.map((entry) => entry.supplier),
        ]
          .map((value) => value.trim())
          .filter(Boolean);
        setKnownSuppliers(dynamic);
      } catch (err) {
        logger.warn('Unable to load known suppliers for invoice form', { err });
      }
    };
    void loadKnownSuppliers();
  }, [getInvoices, getPriceHistory]);

  const supplierQuickPicks = useMemo(() => buildSupplierQuickPicks(knownSuppliers), [knownSuppliers]);
  const canonicalSupplier = useMemo(() => canonicalizeSupplierName(supplier.trim()), [supplier]);
  const isDetectedNewSupplier = useMemo(
    () =>
      !existingInvoice &&
      Boolean(canonicalSupplier) &&
      isNewSupplier(canonicalSupplier, knownSuppliers),
    [existingInvoice, canonicalSupplier, knownSuppliers],
  );

  const totals = useMemo(() => {
    const totalHT = items.reduce((sum, item) => sum + (item.totalPriceHT || 0), 0);
    const totalTVA = Math.round(totalHT * INVOICE_VAT_RATE * 100) / 100;
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
          item.designation = sanitizeInput(String(value));
        } else if (field === 'conditioningQuantity') {
          const numVal = typeof value === 'string' ? parseFloat(value) || 0 : (value as number);
          item.conditioningQuantity = numVal > 1 ? numVal : undefined;
        } else {
          const numVal = typeof value === 'string' ? parseFloat(value) || 0 : (value as number);
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
    const supplierValue = canonicalizeSupplierName(supplier.trim());
    const filteredItems = items.filter((item) => item.designation.trim().length > 0);
    const nextFieldErrors: Partial<Record<InvoiceFieldErrorKey, string>> = {};
    const validationResult = invoiceFormSchema.safeParse({
      supplier: supplierValue,
      invoiceDate,
      items: filteredItems,
    });
    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      for (const issue of validationResult.error.issues) {
        const field = issue.path[0];
        if (field === 'supplier' && !nextFieldErrors.supplier) nextFieldErrors.supplier = issue.message;
        if (field === 'invoiceDate' && !nextFieldErrors.invoiceDate) nextFieldErrors.invoiceDate = issue.message;
        if (field === 'items' && !nextFieldErrors.items) nextFieldErrors.items = issue.message;
      }
      setFieldErrors(nextFieldErrors);
      if (firstIssue.path[0] === 'items' && typeof firstIssue.path[1] === 'number') {
        const row = firstIssue.path[1] + 1;
        setError(`Article ${row}: ${firstIssue.message}`);
        return;
      }
      setError(firstIssue.message);
      return;
    }
    setFieldErrors({});
    if (!existingInvoice && isNewSupplier(supplierValue, knownSuppliers)) {
      const confirmed = window.confirm(
        `Nouveau fournisseur detecte: "${supplierValue}".\nVoulez-vous le sauvegarder ?`,
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => sanitizeInput(t).trim())
        .filter(Boolean);

      const invoice: Invoice = {
        id: existingInvoice?.id ?? crypto.randomUUID(),
        images,
        imageUrls: existingInvoice?.imageUrls,
        supplier: supplierValue,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(invoiceDate),
        items: filteredItems,
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

      // Auto-sync invoice items → ingredients (price + conditioning)
      try {
        const syncResult = await syncInvoiceToIngredients(invoice);
        if (syncResult.updated > 0) {
          logger.info(`Auto-synced ${syncResult.updated} ingredient(s) from invoice`, { invoiceId: invoice.id });
        }
      } catch (err) {
        logger.warn('Invoice→ingredient sync failed (non-blocking)', { err });
      }

      await rebuildPriceHistory();
      onSave();
    } catch (err) {
      logger.error('Invoice save error', { err });
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
    knownSuppliers,
    addInvoice,
    updateInvoice,
    rebuildPriceHistory,
    onSave,
  ]);

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold app-text">
          {existingInvoice ? 'Modifier la facture' : 'Verifier les donnees'}
        </h2>
        <button
          onClick={onCancel}
          className="text-sm app-muted hover:text-[color:var(--app-accent)]"
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
          <label htmlFor={supplierFieldId} className="block text-xs font-medium app-muted mb-1">
            Fournisseur *
          </label>
          <input
            id={supplierFieldId}
            type="text"
            value={supplier}
            onChange={(e) => {
              setSupplier(sanitizeInput(e.target.value));
              if (fieldErrors.supplier) {
                setFieldErrors((prev) => ({ ...prev, supplier: undefined }));
              }
            }}
            className="w-full px-3 py-2 rounded-lg border app-border app-surface app-text text-sm focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent"
            placeholder="Nom du fournisseur"
            aria-invalid={fieldErrors.supplier ? 'true' : 'false'}
            aria-describedby={fieldErrors.supplier ? supplierErrorId : undefined}
          />
          {fieldErrors.supplier && (
            <p id={supplierErrorId} className="mt-1 ios-small text-[color:var(--app-danger)]">
              {fieldErrors.supplier}
            </p>
          )}
          {canonicalSupplier && canonicalSupplier !== supplier.trim() && (
            <button
              type="button"
              onClick={() => setSupplier(canonicalSupplier)}
              className="mt-1 ios-small font-semibold text-[color:var(--app-accent)] active:opacity-70"
            >
              Utiliser le nom normalise: {canonicalSupplier}
            </button>
          )}
          {isDetectedNewSupplier && (
            <p className="mt-1 ios-small font-semibold text-[color:var(--app-warning)]">
              Nouveau fournisseur detecte, verification recommandee avant sauvegarde.
            </p>
          )}
          {supplierQuickPicks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {supplierQuickPicks.map((pick) => (
                <button
                  key={`invoice-supplier-pick-${pick}`}
                  type="button"
                  onClick={() => setSupplier(pick)}
                  className={cn(
                    'px-2 py-1 rounded-full ios-small font-semibold active:opacity-70',
                    canonicalSupplier.toLowerCase() === pick.toLowerCase() ? 'app-accent-bg' : 'app-surface-2 app-text',
                  )}
                >
                  {pick}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={numberFieldId} className="block text-xs font-medium app-muted mb-1">
              N. facture
            </label>
            <input
              id={numberFieldId}
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(sanitizeInput(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border app-border app-surface app-text text-sm focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent"
              placeholder="FA-2024-001"
            />
          </div>
          <div>
            <label htmlFor={dateFieldId} className="block text-xs font-medium app-muted mb-1">
              Date
            </label>
            <input
              id={dateFieldId}
              type="date"
              value={invoiceDate}
              onChange={(e) => {
                setInvoiceDate(e.target.value);
                if (fieldErrors.invoiceDate) {
                  setFieldErrors((prev) => ({ ...prev, invoiceDate: undefined }));
                }
              }}
              className="w-full px-3 py-2 rounded-lg border app-border app-surface app-text text-sm focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent"
              aria-invalid={fieldErrors.invoiceDate ? 'true' : 'false'}
              aria-describedby={fieldErrors.invoiceDate ? dateErrorId : undefined}
            />
            {fieldErrors.invoiceDate && (
              <p id={dateErrorId} className="mt-1 ios-small text-[color:var(--app-danger)]">
                {fieldErrors.invoiceDate}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold app-text">
            Articles
          </h3>
          <button
            onClick={handleAddItem}
            className="flex items-center gap-1 text-xs text-[color:var(--app-accent)] hover:opacity-80"
          >
            <PlusIcon />
            Ajouter
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => {
            const designationId = `invoice-item-designation-${index}`;
            const quantityId = `invoice-item-quantity-${index}`;
            const unitPriceId = `invoice-item-unit-price-${index}`;
            const totalPriceId = `invoice-item-total-price-${index}`;

            return (
              <div
                key={index}
                className="p-3 rounded-lg border app-border app-surface space-y-2"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <label htmlFor={designationId} className="sr-only">
                      Designation article {index + 1}
                    </label>
                    <input
                      id={designationId}
                      type="text"
                      value={item.designation}
                      onChange={(e) =>
                        handleItemChange(index, 'designation', e.target.value)
                      }
                      className="w-full px-2 py-1.5 rounded border app-border app-surface-2 app-text text-sm focus:ring-1 focus:ring-[color:var(--app-accent)]"
                      placeholder="Designation"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveItem(index)}
                    disabled={items.length <= 1}
                    aria-label={`Supprimer l'article ${item.designation || index + 1}`}
                    className={cn(
                      'p-1.5 rounded text-[color:var(--app-danger)] active:opacity-70',
                      items.length <= 1 && 'opacity-30 cursor-not-allowed'
                    )}
                  >
                    <TrashIcon />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor={quantityId} className="block text-[10px] app-muted mb-0.5">
                      Quantite
                    </label>
                    <input
                      id={quantityId}
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(index, 'quantity', e.target.value)
                      }
                      className="w-full px-2 py-1.5 rounded border app-border app-surface-2 app-text text-sm focus:ring-1 focus:ring-[color:var(--app-accent)]"
                    />
                  </div>
                  <div>
                    <label htmlFor={unitPriceId} className="block text-[10px] app-muted mb-0.5">
                      Prix unit. HT
                    </label>
                    <input
                      id={unitPriceId}
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitPriceHT}
                      onChange={(e) =>
                        handleItemChange(index, 'unitPriceHT', e.target.value)
                      }
                      className="w-full px-2 py-1.5 rounded border app-border app-surface-2 app-text text-sm focus:ring-1 focus:ring-[color:var(--app-accent)]"
                    />
                  </div>
                  <div>
                    <label htmlFor={totalPriceId} className="block text-[10px] app-muted mb-0.5">
                      Total HT
                    </label>
                    <input
                      id={totalPriceId}
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.totalPriceHT}
                      onChange={(e) =>
                        handleItemChange(index, 'totalPriceHT', e.target.value)
                      }
                      className="w-full px-2 py-1.5 rounded border app-border app-surface-2 app-text text-sm focus:ring-1 focus:ring-[color:var(--app-accent)]"
                    />
                  </div>
                </div>
                {/* Colisage */}
                <div className="flex items-center gap-2">
                  <label htmlFor={`invoice-item-cond-${index}`} className="text-[10px] app-muted whitespace-nowrap">
                    Colisage
                  </label>
                  <input
                    id={`invoice-item-cond-${index}`}
                    type="number"
                    step="1"
                    min="0"
                    value={item.conditioningQuantity || ''}
                    onChange={(e) =>
                      handleItemChange(index, 'conditioningQuantity', e.target.value)
                    }
                    placeholder="ex: 90"
                    className="w-20 px-2 py-1 rounded border app-border app-surface-2 app-text text-xs focus:ring-1 focus:ring-[color:var(--app-accent)]"
                  />
                  {item.conditioningQuantity && item.conditioningQuantity > 1 && item.unitPriceHT > 0 && (
                    <span className="text-[10px] app-accent font-medium">
                      = {(item.unitPriceHT / item.conditioningQuantity).toFixed(4)} EUR/u
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="p-3 rounded-lg app-surface-2 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="app-muted">Total HT</span>
          <span className="font-medium app-text">
            {totals.totalHT.toFixed(2)} EUR
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="app-muted">TVA (5,5%)</span>
          <span className="font-medium app-text">
            {totals.totalTVA.toFixed(2)} EUR
          </span>
        </div>
        <div className="flex justify-between text-sm font-bold border-t app-border pt-1.5">
          <span className="app-text">Total TTC</span>
          <span className="text-[color:var(--app-accent)]">
            {totals.totalTTC.toFixed(2)} EUR
          </span>
        </div>
      </div>

      {/* OCR Raw Text (collapsible) */}
      <details className="group">
        <summary className="text-xs font-medium app-muted cursor-pointer hover:text-[color:var(--app-accent)]">
          Voir le texte OCR brut
        </summary>
        <pre className="mt-2 p-3 rounded-lg app-surface-2 border app-border ios-small app-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
          {initialData.text}
        </pre>
      </details>

      {/* Tags */}
      <div>
        <label htmlFor={tagsFieldId} className="block text-xs font-medium app-muted mb-1">
          Tags (séparés par des virgules)
        </label>
        <input
          id={tagsFieldId}
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(sanitizeInput(e.target.value))}
          className="w-full px-3 py-2 rounded-lg border app-border app-surface app-text text-sm focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent"
          placeholder="viande, poisson, legumes..."
        />
      </div>

      {/* Error */}
      {error && (
        <div
          id={formErrorId}
          role="alert"
          className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-3 px-4 rounded-xl border app-border app-text font-medium text-sm hover:bg-[color:var(--app-surface-2)] transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'flex-1 py-3 px-4 rounded-xl app-accent-bg font-medium text-sm transition-colors flex items-center justify-center gap-2',
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

