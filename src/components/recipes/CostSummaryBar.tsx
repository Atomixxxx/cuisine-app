import type { RecipeCostSummary } from '../../types';
import { cn } from '../../utils';

function money(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

interface CostSummaryBarProps {
  summary: RecipeCostSummary;
  portions?: number;
  salePriceHT?: number;
  lastSavedRate?: number;
  className?: string;
}

export default function CostSummaryBar({
  summary,
  portions,
  salePriceHT,
  lastSavedRate,
  className,
}: CostSummaryBarProps) {
  const hasSalePrice = Number.isFinite(salePriceHT) && (salePriceHT ?? 0) > 0;
  const safePortions = portions && portions > 0 ? portions : 1;
  const costPerPortion = summary.totalCost / safePortions;

  if (!hasSalePrice) {
    return (
      <div className={cn('rounded-2xl border app-border app-surface-2 px-4 py-3 shadow-[0_-10px_24px_rgba(0,0,0,0.14)]', className)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ios-caption app-muted">Cout total</p>
            <p className="text-[20px] leading-none font-bold app-text mt-1">{money(summary.totalCost)}</p>
          </div>
          {safePortions > 1 && (
            <div className="text-right">
              <p className="ios-caption app-muted">Cout / portion</p>
              <p className="text-[16px] leading-none font-semibold app-text mt-1">{money(costPerPortion)}</p>
            </div>
          )}
        </div>
        <p className="ios-caption app-muted mt-2">
          Ajoute un prix de vente pour afficher le food cost et la marge.
        </p>
      </div>
    );
  }

  const toneClasses =
    summary.warningLevel === 'danger'
      ? 'border-[color:var(--app-danger)]/35 bg-[color:var(--app-danger)]/10'
      : summary.warningLevel === 'warning'
        ? 'border-[color:var(--app-warning)]/35 bg-[color:var(--app-warning)]/10'
        : 'border-[color:var(--app-success)]/35 bg-[color:var(--app-success)]/10';

  const badgeClasses =
    summary.warningLevel === 'danger'
      ? 'bg-[color:var(--app-danger)] text-white'
      : summary.warningLevel === 'warning'
        ? 'bg-[color:var(--app-warning)] text-white'
        : 'bg-[color:var(--app-success)] text-white';

  return (
    <div className={cn('rounded-2xl border px-4 py-3 shadow-[0_-10px_24px_rgba(0,0,0,0.14)]', toneClasses, className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="ios-caption app-muted">Food cost</p>
          <p className="text-[28px] leading-none font-extrabold app-text mt-1">
            {(summary.foodCostRate * 100).toFixed(1)}%
          </p>
        </div>
        <span className={cn('px-2.5 py-1 rounded-full text-[12px] font-semibold', badgeClasses)}>
          {summary.warningLevel === 'danger' ? 'Alerte' : summary.warningLevel === 'warning' ? 'Surveillance' : 'OK'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <div className="rounded-xl app-surface px-2.5 py-2">
          <p className="ios-caption app-muted">Prix HT</p>
          <p className="text-[14px] font-semibold app-text">{money(salePriceHT ?? 0)}</p>
        </div>
        <div className="rounded-xl app-surface px-2.5 py-2">
          <p className="ios-caption app-muted">Cout total</p>
          <p className="text-[14px] font-semibold app-text">{money(summary.totalCost)}</p>
        </div>
        <div className="rounded-xl app-surface px-2.5 py-2">
          <p className="ios-caption app-muted">Marge brute</p>
          <p className="text-[14px] font-semibold app-text">{money(summary.grossMargin)}</p>
        </div>
        <div className="rounded-xl app-surface px-2.5 py-2">
          <p className="ios-caption app-muted">Cout/portion</p>
          <p className="text-[14px] font-semibold app-text">{money(costPerPortion)}</p>
        </div>
      </div>

      {summary.foodCostRate > 0.3 && (
        <p className="ios-caption font-semibold text-[color:var(--app-danger)] mt-2">
          Alerte: le food cost depasse 30% du prix de vente.
        </p>
      )}
      {lastSavedRate !== undefined && lastSavedRate > 0 && (
        <p className="ios-caption app-muted mt-1">
          Dernier calcul en base: {(lastSavedRate * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}
