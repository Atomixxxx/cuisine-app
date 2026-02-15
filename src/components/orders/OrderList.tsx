import type { Order, OrderStatus } from '../../types';
import EmptyState from '../common/EmptyState';
import OrderCard from './OrderCard';
import OrderKpiCards from './OrderKpiCards';

export interface OrderListFilters {
  status: OrderStatus | 'all';
  supplier: string;
}

interface OrderListProps {
  orders: Order[];
  allOrders: Order[];
  loading: boolean;
  filters: OrderListFilters;
  onFiltersChange: (filters: OrderListFilters) => void;
  onCreate: () => void;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
}

const STATUS_FILTERS: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'draft', label: 'Brouillon' },
  { key: 'sent', label: 'Envoyee' },
  { key: 'received', label: 'Recue' },
  { key: 'invoiced', label: 'Facturee' },
];

export default function OrderList({
  orders,
  allOrders,
  loading,
  filters,
  onFiltersChange,
  onCreate,
  onEdit,
  onDelete,
}: OrderListProps) {
  const suppliers = Array.from(
    new Set(allOrders.map((order) => order.supplier.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      <OrderKpiCards orders={allOrders} />

      <div className="app-panel space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_FILTERS.map((statusFilter) => (
            <button
              key={statusFilter.key}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  status: statusFilter.key,
                })
              }
              className={`app-chip-btn whitespace-nowrap ${
                filters.status === statusFilter.key
                  ? 'app-accent-bg'
                  : 'app-surface-2 app-muted'
              }`}
            >
              {statusFilter.label}
            </button>
          ))}
        </div>

        <select
          value={filters.supplier}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              supplier: e.target.value,
            })
          }
          className="app-input w-full"
        >
          <option value="">Tous les fournisseurs</option>
          {suppliers.map((supplier) => (
            <option key={supplier} value={supplier}>
              {supplier}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-2 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && orders.length === 0 && (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2h12l1 6H5l1-6zM3 8h18l-2 12H5L3 8z" />
            </svg>
          }
          title="Aucune commande"
          description="Cree ta premiere commande fournisseur."
          action={
            <button onClick={onCreate} className="app-accent-bg px-4 py-2 rounded-xl text-sm font-semibold">
              Nouvelle commande
            </button>
          }
        />
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-2 pb-20">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}

      <button
        onClick={onCreate}
        className="fixed bottom-16 right-3 z-30 w-12 h-12 rounded-full app-accent-bg flex items-center justify-center active:opacity-70 transition-opacity spx-fab"
        aria-label="Nouvelle commande"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
