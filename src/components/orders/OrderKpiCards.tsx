import type { Order } from '../../types';

interface OrderKpiCardsProps {
  orders: Order[];
}

export default function OrderKpiCards({ orders }: OrderKpiCardsProps) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlyOrders = orders.filter((order) => {
    const date = new Date(order.orderDate);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  const pendingOrders = orders.filter(
    (order) => order.status === 'draft' || order.status === 'sent',
  ).length;
  const receivedOrders = orders.filter((order) => order.status === 'received').length;
  const totalHT = orders.reduce((sum, order) => sum + order.totalHT, 0);

  return (
    <div className="app-kpi-grid">
      <div className="glass-card glass-kpi">
        <p className="app-kpi-label">Du mois</p>
        <p className="app-kpi-value">{monthlyOrders}</p>
      </div>
      <div className="glass-card glass-kpi">
        <p className="app-kpi-label">En attente</p>
        <p className="app-kpi-value">{pendingOrders}</p>
      </div>
      <div className="glass-card glass-kpi">
        <p className="app-kpi-label">Recues</p>
        <p className="app-kpi-value">{receivedOrders}</p>
      </div>
      <div className="glass-card glass-kpi">
        <p className="app-kpi-label">Montant HT</p>
        <p className="app-kpi-value text-[15px]">{totalHT.toFixed(2)} EUR</p>
      </div>
    </div>
  );
}

