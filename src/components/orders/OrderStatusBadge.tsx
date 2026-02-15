import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '../../types';

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export default function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold"
      style={{
        color: ORDER_STATUS_COLORS[status],
        backgroundColor: `${ORDER_STATUS_COLORS[status]}1A`,
      }}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
