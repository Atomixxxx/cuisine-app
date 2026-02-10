import type { Equipment, ProductTrace, Task, TemperatureRecord } from '../types';

export type SmartAlertSeverity = 'danger' | 'warning' | 'info';

export interface SmartAlert {
  id: string;
  severity: SmartAlertSeverity;
  title: string;
  description: string;
  path: string;
  count?: number;
}

interface BuildSmartAlertsInput {
  equipment: Equipment[];
  todayRecords: TemperatureRecord[];
  tasks: Task[];
  products: ProductTrace[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfTodayMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function plural(value: number, singular: string, pluralForm: string): string {
  return `${value} ${value > 1 ? pluralForm : singular}`;
}

export function buildSmartAlerts({
  equipment,
  todayRecords,
  tasks,
  products,
}: BuildSmartAlertsInput): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const nowMs = Date.now();
  const todayStartMs = startOfTodayMs();
  const activeProducts = products.filter((product) => product.status !== 'used');

  const checkedEquipment = new Set(todayRecords.map((r) => r.equipmentId));
  const missingChecks = Math.max(equipment.length - checkedEquipment.size, 0);
  if (equipment.length > 0 && missingChecks > 0) {
    alerts.push({
      id: 'missing-temp-checks',
      severity: 'warning',
      title: 'Releves manquants',
      description: `${plural(missingChecks, 'equipement', 'equipements')} sans releve aujourd'hui.`,
      path: '/temperature',
      count: missingChecks,
    });
  }

  const anomalies = todayRecords.filter((r) => !r.isCompliant).length;
  if (anomalies > 0) {
    alerts.push({
      id: 'temp-anomalies',
      severity: 'danger',
      title: 'Anomalies temperature',
      description: `${plural(anomalies, 'anomalie', 'anomalies')} detectee${anomalies > 1 ? 's' : ''} aujourd'hui.`,
      path: '/temperature?quick=history',
      count: anomalies,
    });
  }

  const overdueTasks = tasks.filter((task) => {
    if (task.completed || task.archived) return false;
    const createdAt = new Date(task.createdAt).getTime();
    return createdAt < todayStartMs;
  }).length;
  if (overdueTasks > 0) {
    alerts.push({
      id: 'overdue-tasks',
      severity: 'warning',
      title: 'Taches en retard',
      description: `${plural(overdueTasks, 'tache', 'taches')} non terminee${overdueTasks > 1 ? 's' : ''}.`,
      path: '/tasks',
      count: overdueTasks,
    });
  }

  const expiredProducts = activeProducts.filter((product) => {
    const daysLeft = Math.ceil((new Date(product.expirationDate).getTime() - nowMs) / DAY_MS);
    return daysLeft < 0;
  }).length;
  if (expiredProducts > 0) {
    alerts.push({
      id: 'expired-products',
      severity: 'danger',
      title: 'Produits expires',
      description: `${plural(expiredProducts, 'produit', 'produits')} hors DLC.`,
      path: '/traceability?tab=history',
      count: expiredProducts,
    });
  }

  const expiringSoon = activeProducts.filter((product) => {
    const daysLeft = Math.ceil((new Date(product.expirationDate).getTime() - nowMs) / DAY_MS);
    return daysLeft >= 0 && daysLeft <= 2;
  }).length;
  if (expiringSoon > 0) {
    alerts.push({
      id: 'expiring-soon',
      severity: 'warning',
      title: 'DLC proches',
      description: `${plural(expiringSoon, 'produit', 'produits')} a traiter sous 48h.`,
      path: '/traceability?tab=history',
      count: expiringSoon,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear',
      severity: 'info',
      title: 'Rien a signaler',
      description: 'Tous les indicateurs sont au vert pour le moment.',
      path: '/dashboard',
      count: 0,
    });
  }

  const severityRank: Record<SmartAlertSeverity, number> = {
    danger: 0,
    warning: 1,
    info: 2,
  };

  return alerts
    .sort((a, b) => {
      const rankDiff = severityRank[a.severity] - severityRank[b.severity];
      if (rankDiff !== 0) return rankDiff;
      return (b.count ?? 0) - (a.count ?? 0);
    })
    .slice(0, 6);
}
