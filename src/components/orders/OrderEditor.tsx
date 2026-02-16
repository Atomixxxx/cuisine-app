import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildSupplierQuickPicks, canonicalizeSupplierName } from '../../services/suppliers';
import { calculateOrderTotal, canTransitionStatus, getNextStatuses, orderSchema } from '../../services/orderHelpers';
import type { IngredientUnit, Invoice, Order, OrderItem, OrderStatus } from '../../types';
import OrderItemEditor from './OrderItemEditor';
import OrderStatusBadge from './OrderStatusBadge';

interface OrderEditorProps {
  order: Order | null;
  defaultOrderNumber: string;
  knownSuppliers: string[];
  ingredientSuggestions: string[];
  invoices: Invoice[];
  onCancel: () => void;
  onSave: (order: Order) => Promise<void> | void;
  onStatusChange: (order: Order, nextStatus: OrderStatus, invoiceId?: string) => Order;
}

function toDateInput(date?: Date): string {
  if (!date) return '';
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
}

function makeEmptyItem(): OrderItem {
  return {
    id: crypto.randomUUID(),
    productName: '',
    quantity: 1,
    unit: 'unite',
    unitPriceHT: 0,
    totalPriceHT: 0,
  };
}

function normalizeUnitToken(unitRaw?: string): IngredientUnit {
  const normalized = (unitRaw ?? '').trim().toLowerCase();
  if (normalized === 'kg') return 'kg';
  if (normalized === 'g') return 'g';
  if (normalized === 'l') return 'l';
  if (normalized === 'ml') return 'ml';
  if (normalized === 'u' || normalized === 'unite' || normalized === 'unites') return 'unite';
  return 'unite';
}

function toNumber(valueRaw: string): number {
  const normalized = valueRaw.replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function parseHandwrittenItems(noteText: string): OrderItem[] {
  const lines = noteText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const leadingPattern = /^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|u|unite|unites)?\s+(.+)$/i.exec(line);
    if (leadingPattern) {
      const quantity = toNumber(leadingPattern[1]);
      const unit = normalizeUnitToken(leadingPattern[2]);
      return {
        id: crypto.randomUUID(),
        productName: leadingPattern[3].trim(),
        quantity,
        unit,
        unitPriceHT: 0,
        totalPriceHT: 0,
      };
    }

    const trailingPattern = /^(.+?)\s+[xX]\s*(\d+(?:[.,]\d+)?)$/i.exec(line);
    if (trailingPattern) {
      return {
        id: crypto.randomUUID(),
        productName: trailingPattern[1].trim(),
        quantity: toNumber(trailingPattern[2]),
        unit: 'unite',
        unitPriceHT: 0,
        totalPriceHT: 0,
      };
    }

    const productWithUnitAtEndPattern = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|u|unite|unites)$/i.exec(line);
    if (productWithUnitAtEndPattern) {
      return {
        id: crypto.randomUUID(),
        productName: productWithUnitAtEndPattern[1].trim(),
        quantity: toNumber(productWithUnitAtEndPattern[2]),
        unit: normalizeUnitToken(productWithUnitAtEndPattern[3]),
        unitPriceHT: 0,
        totalPriceHT: 0,
      };
    }

    return {
      id: crypto.randomUUID(),
      productName: line,
      quantity: 1,
      unit: 'unite',
      unitPriceHT: 0,
      totalPriceHT: 0,
    };
  });
}

function buildDraft(order: Order | null, orderNumber: string): Order {
  if (order) {
    const normalizedItems = order.items.length > 0 ? order.items : [makeEmptyItem()];
    return {
      ...order,
      items: normalizedItems,
      totalHT: calculateOrderTotal(normalizedItems),
    };
  }
  const now = new Date();
  const items = [makeEmptyItem()];
  return {
    id: crypto.randomUUID(),
    orderNumber,
    supplier: '',
    status: 'draft',
    items,
    orderDate: now,
    expectedDeliveryDate: undefined,
    actualDeliveryDate: undefined,
    totalHT: 0,
    notes: '',
    invoiceId: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export default function OrderEditor({
  order,
  defaultOrderNumber,
  knownSuppliers,
  ingredientSuggestions,
  invoices,
  onCancel,
  onSave,
  onStatusChange,
}: OrderEditorProps) {
  const [draft, setDraft] = useState<Order>(() => buildDraft(order, defaultOrderNumber));
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const nextDraft = buildDraft(order, defaultOrderNumber);
    setDraft(nextDraft);
    setSelectedInvoiceId(nextDraft.invoiceId ?? '');
    setError(null);
    setShowDetails(false);
  }, [order, defaultOrderNumber]);

  const supplierQuickPicks = useMemo(
    () => buildSupplierQuickPicks(knownSuppliers),
    [knownSuppliers],
  );

  const supplierInvoices = useMemo(() => {
    const canonicalSupplier = canonicalizeSupplierName(draft.supplier);
    if (!canonicalSupplier) return [];
    return invoices.filter(
      (invoice) =>
        canonicalizeSupplierName(invoice.supplier).toLowerCase() === canonicalSupplier.toLowerCase(),
    );
  }, [draft.supplier, invoices]);

  const linkedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === draft.invoiceId),
    [draft.invoiceId, invoices],
  );
  const parsedNoteItems = useMemo(
    () =>
      parseHandwrittenItems(draft.notes ?? '').filter((item) => item.productName.trim().length > 0),
    [draft.notes],
  );

  const nextStatuses = getNextStatuses(draft.status);

  const updateItems = (nextItems: OrderItem[]) => {
    setDraft((prev) => ({
      ...prev,
      items: nextItems,
      totalHT: calculateOrderTotal(nextItems),
      updatedAt: new Date(),
    }));
  };

  const handleItemChange = (itemId: string, patch: Partial<OrderItem>) => {
    const nextItems = draft.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            ...patch,
          }
        : item,
    );
    updateItems(nextItems);
  };

  const handleRemoveItem = (itemId: string) => {
    if (draft.items.length <= 1) return;
    updateItems(draft.items.filter((item) => item.id !== itemId));
  };

  const applyStatus = (nextStatus: OrderStatus, invoiceId?: string) => {
    if (!canTransitionStatus(draft.status, nextStatus)) return;
    const transitioned = onStatusChange(draft, nextStatus, invoiceId);
    setDraft({
      ...transitioned,
      totalHT: calculateOrderTotal(transitioned.items),
      updatedAt: new Date(),
    });
  };

  const handleSave = async () => {
    const manualItems = draft.items.filter((item) => item.productName.trim().length > 0);
    const itemsFromNotes = parseHandwrittenItems(draft.notes ?? '').filter(
      (item) => item.productName.trim().length > 0,
    );
    const finalItems = itemsFromNotes.length > 0 ? itemsFromNotes : manualItems;
    const finalTotalHT = calculateOrderTotal(finalItems);

    const validation = orderSchema.safeParse({
      supplier: canonicalizeSupplierName(draft.supplier),
      items: finalItems,
      orderDate: new Date(draft.orderDate),
      totalHT: finalTotalHT,
      notes: draft.notes,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Commande invalide');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const canonicalSupplier = canonicalizeSupplierName(draft.supplier);
      const payload: Order = {
        ...draft,
        supplier: canonicalSupplier,
        items: finalItems,
        totalHT: finalTotalHT,
        updatedAt: new Date(),
      };
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 app-bg flex flex-col">
      <header className="sticky top-0 z-10 app-header px-4 py-3 hairline-b flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold app-text">
            {order ? 'Modifier commande' : 'Nouvelle commande'}
          </h2>
          <p className="ios-small app-muted">{draft.orderNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-xl app-surface-2 app-text text-sm font-medium"
          >
            Fermer
          </button>
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
            className="px-3 py-2 rounded-xl app-accent-bg text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
        <div className="glass-card glass-panel space-y-3">
          <div>
            <label className="block text-[11px] app-muted mb-1">Fournisseur</label>
            <input
              value={draft.supplier}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, supplier: e.target.value, updatedAt: new Date() }))
              }
              className="app-input w-full"
              placeholder="Nom fournisseur"
              list="order-supplier-picks"
            />
            <datalist id="order-supplier-picks">
              {supplierQuickPicks.map((supplier) => (
                <option key={supplier} value={supplier} />
              ))}
            </datalist>
            {supplierQuickPicks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {supplierQuickPicks.slice(0, 8).map((supplier) => (
                  <button
                    key={`supplier-pick-${supplier}`}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, supplier, updatedAt: new Date() }))
                    }
                    className="px-2 py-1 rounded-full text-[11px] font-semibold app-surface-2 app-text"
                  >
                    {supplier}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card glass-panel space-y-2">
          <label className="block text-[11px] app-muted">
            Note manuscrite (enregistree directement sur ce fournisseur)
          </label>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, notes: e.target.value, updatedAt: new Date() }))
            }
            className="app-input w-full min-h-28 resize-y"
            placeholder={"Ex:\n3 kg tomates\nCitron x12\n2 l huile"}
          />
          <div className="flex items-center justify-between text-xs app-muted">
            <span>{parsedNoteItems.length} ligne(s) detectee(s)</span>
            <span>Conversion auto a la sauvegarde</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="app-muted">Total HT</span>
            <span className="font-semibold app-text">{draft.totalHT.toFixed(2)} EUR</span>
          </div>
        </div>

        <div className="glass-card glass-panel">
          <button
            type="button"
            onClick={() => setShowDetails((previous) => !previous)}
            className="w-full flex items-center justify-between text-sm font-semibold app-text"
          >
            <span>Details (optionnel)</span>
            <span className="app-muted">{showDetails ? 'Masquer' : 'Afficher'}</span>
          </button>
          {showDetails && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] app-muted mb-1">Date commande</label>
                  <input
                    type="date"
                    value={toDateInput(draft.orderDate)}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        orderDate: new Date(e.target.value),
                        updatedAt: new Date(),
                      }))
                    }
                    className="app-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-[11px] app-muted mb-1">Livraison prevue</label>
                  <input
                    type="date"
                    value={toDateInput(draft.expectedDeliveryDate)}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        expectedDeliveryDate: e.target.value ? new Date(e.target.value) : undefined,
                        updatedAt: new Date(),
                      }))
                    }
                    className="app-input w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold app-text">Articles details</h3>
                {draft.items.map((item, index) => (
                  <OrderItemEditor
                    key={item.id}
                    index={index}
                    item={item}
                    canRemove={draft.items.length > 1}
                    ingredientSuggestions={ingredientSuggestions}
                    onChange={(patch) => handleItemChange(item.id, patch)}
                    onRemove={() => handleRemoveItem(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass-card glass-panel space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold app-text">Statut</h3>
            <OrderStatusBadge status={draft.status} />
          </div>

          {nextStatuses.includes('sent') && (
            <button
              type="button"
              onClick={() => applyStatus('sent')}
              className="w-full px-3 py-2 rounded-xl app-surface-2 app-text text-sm font-semibold"
            >
              Marquer envoyee
            </button>
          )}

          {nextStatuses.includes('received') && (
            <button
              type="button"
              onClick={() => applyStatus('received')}
              className="w-full px-3 py-2 rounded-xl app-surface-2 app-text text-sm font-semibold"
            >
              Marquer recue
            </button>
          )}

          {draft.status === 'received' && (
            <div className="space-y-2">
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="app-input w-full"
              >
                <option value="">Selectionner une facture</option>
                {supplierInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber || invoice.id} - {invoice.totalHT.toFixed(2)} EUR HT
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => applyStatus('invoiced', selectedInvoiceId || undefined)}
                disabled={!selectedInvoiceId}
                className="w-full px-3 py-2 rounded-xl app-accent-bg text-sm font-semibold disabled:opacity-60"
              >
                Lier a une facture
              </button>
            </div>
          )}

          {draft.status === 'invoiced' && draft.invoiceId && (
            <Link
              to="/invoices"
              className="inline-flex text-sm font-semibold text-[color:var(--app-accent)] underline underline-offset-2"
            >
              Facture liee: {linkedInvoice?.invoiceNumber || draft.invoiceId}
            </Link>
          )}
        </div>

        {error && (
          <div className="glass-card glass-panel border border-[color:var(--app-danger)]/40 text-[color:var(--app-danger)] text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

