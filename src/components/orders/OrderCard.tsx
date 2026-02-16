import { memo, useCallback, useRef, useState, type TouchEvent } from 'react';
import type { Order } from '../../types';
import { formatDateShort } from '../../utils';
import OrderStatusBadge from './OrderStatusBadge';

interface OrderCardProps {
  order: Order;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
}

function OrderCardComponent({ order, onEdit, onDelete }: OrderCardProps) {
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!swiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
    }
    if (swiping.current) {
      e.preventDefault();
      setSwipeX(Math.max(-96, Math.min(0, dx)));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    setSwipeX((current) => (current < -56 ? -96 : 0));
    swiping.current = false;
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 w-24 bg-[color:var(--app-danger)] flex items-center justify-center">
        <button
          onClick={() => onDelete(order.id)}
          className="w-full h-full text-white text-sm font-semibold"
          aria-label="Supprimer la commande"
        >
          Suppr.
        </button>
      </div>

      <button
        onClick={() => {
          if (swipeX !== 0) {
            setSwipeX(0);
            return;
          }
          onEdit(order);
        }}
        className="relative w-full text-left app-card p-3.5 transition-transform duration-200"
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold app-text truncate">{order.orderNumber}</p>
            <p className="text-xs app-muted truncate">{order.supplier || 'Fournisseur non defini'}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs app-muted gap-2">
          <span>Date: {formatDateShort(order.orderDate)}</span>
          <span>{order.items.length} article(s)</span>
          <span className="font-semibold app-text">{order.totalHT.toFixed(2)} EUR HT</span>
        </div>
      </button>
    </div>
  );
}

const OrderCard = memo(OrderCardComponent);
export default OrderCard;
