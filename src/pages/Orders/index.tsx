import { useCallback, useEffect, useMemo, useState } from 'react';
import OrderEditor from '../../components/orders/OrderEditor';
import OrderList, { type OrderListFilters } from '../../components/orders/OrderList';
import { canTransitionStatus } from '../../services/orderHelpers';
import { showError, showSuccess } from '../../stores/toastStore';
import { useAppStore } from '../../stores/appStore';
import type { Invoice, Order, OrderFilters } from '../../types';

const DEFAULT_FILTERS: OrderListFilters = {
  status: 'all',
  supplier: '',
};

export default function OrdersPage() {
  const getOrders = useAppStore((state) => state.getOrders);
  const addOrder = useAppStore((state) => state.addOrder);
  const updateOrder = useAppStore((state) => state.updateOrder);
  const deleteOrder = useAppStore((state) => state.deleteOrder);
  const generateOrderNumber = useAppStore((state) => state.generateOrderNumber);
  const getInvoices = useAppStore((state) => state.getInvoices);
  const getIngredients = useAppStore((state) => state.getIngredients);

  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OrderListFilters>(DEFAULT_FILTERS);
  const [showEditor, setShowEditor] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [nextOrderNumber, setNextOrderNumber] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<string[]>([]);

  const loadOrders = useCallback(
    async (nextFilters: OrderListFilters) => {
      setLoading(true);
      try {
        const storeFilters: OrderFilters = {
          status: nextFilters.status === 'all' ? undefined : nextFilters.status,
          supplier: nextFilters.supplier || undefined,
        };
        const [filtered, full, invoiceRows, ingredients] = await Promise.all([
          getOrders(storeFilters),
          getOrders(),
          getInvoices(),
          getIngredients(),
        ]);
        setOrders(filtered);
        setAllOrders(full);
        setInvoices(invoiceRows);
        setIngredientSuggestions(
          Array.from(new Set(ingredients.map((ingredient) => ingredient.name.trim()).filter(Boolean))).sort(
            (a, b) => a.localeCompare(b),
          ),
        );
      } catch {
        showError('Impossible de charger les commandes');
      } finally {
        setLoading(false);
      }
    },
    [getOrders, getInvoices, getIngredients],
  );

  useEffect(() => {
    void loadOrders(filters);
  }, [filters, loadOrders]);

  const knownSuppliers = useMemo(
    () =>
      Array.from(
        new Set([
          ...allOrders.map((order) => order.supplier.trim()),
          ...invoices.map((invoice) => invoice.supplier.trim()),
        ].filter(Boolean)),
      ),
    [allOrders, invoices],
  );

  const handleCreate = useCallback(async () => {
    try {
      const generated = await generateOrderNumber();
      setNextOrderNumber(generated);
      setEditingOrder(null);
      setShowEditor(true);
    } catch {
      showError('Impossible de generer le numero de commande');
    }
  }, [generateOrderNumber]);

  const handleEdit = useCallback((order: Order) => {
    setEditingOrder(order);
    setNextOrderNumber(order.orderNumber);
    setShowEditor(true);
  }, []);

  const handleSave = useCallback(
    async (order: Order) => {
      try {
        if (editingOrder) {
          await updateOrder(order);
          showSuccess('Commande mise a jour');
        } else {
          await addOrder(order);
          showSuccess('Commande creee');
        }
        setShowEditor(false);
        setEditingOrder(null);
        await loadOrders(filters);
      } catch {
        showError('Impossible de sauvegarder la commande');
      }
    },
    [addOrder, editingOrder, filters, loadOrders, updateOrder],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteOrder(id);
        await loadOrders(filters);
      } catch {
        showError('Impossible de supprimer la commande');
      }
    },
    [deleteOrder, filters, loadOrders],
  );

  const handleStatusChange = useCallback(
    (order: Order, nextStatus: Order['status'], invoiceId?: string): Order => {
      if (!canTransitionStatus(order.status, nextStatus)) return order;
      const now = new Date();
      if (nextStatus === 'invoiced') {
        if (!invoiceId) return order;
        return {
          ...order,
          status: nextStatus,
          invoiceId,
          updatedAt: now,
        };
      }
      if (nextStatus === 'received') {
        return {
          ...order,
          status: nextStatus,
          actualDeliveryDate: now,
          updatedAt: now,
        };
      }
      return {
        ...order,
        status: nextStatus,
        updatedAt: now,
      };
    },
    [],
  );

  return (
    <div className="app-page-wrap h-full pb-24">
      <div className="glass-card glass-hero space-y-2 animate-fade-in-up">
        <h1 className="ios-title app-text">Commandes</h1>
        <p className="text-[11px] sm:text-[12px] app-muted">
          Suivi des bons de commande fournisseur, du brouillon a la facture.
        </p>
      </div>

      <OrderList
        orders={orders}
        allOrders={allOrders}
        loading={loading}
        filters={filters}
        onFiltersChange={setFilters}
        onCreate={() => {
          void handleCreate();
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {showEditor && (
        <OrderEditor
          order={editingOrder}
          defaultOrderNumber={nextOrderNumber}
          knownSuppliers={knownSuppliers}
          ingredientSuggestions={ingredientSuggestions}
          invoices={invoices}
          onCancel={() => {
            setShowEditor(false);
            setEditingOrder(null);
          }}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

