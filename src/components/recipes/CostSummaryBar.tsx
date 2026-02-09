import type { RecipeCostSummary } from '../../types';
import { cn } from '../../utils';

function money(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

interface CostSummaryBarProps {
  summary: RecipeCostSummary;
  portions?: number;
  lastSavedRate?: number;
  sticky?: boolean;
}

export default function CostSummaryBar({ summary, portions, lastSavedRate, sticky = true }: CostSummaryBarProps) {
  const tone =
    summary.warningLevel === 'danger'
      ? 'border-[color:var(--app-danger)]/40 bg-[color:var(--app-danger)]/10'
      : summary.warningLevel === 'warning'
        ? 'border-[color:var(--app-warning)]/40 bg-[color:var(--app-warning)]/10'
        : 'border-[color:var(--app-success)]/40 bg-[color:var(--app-success)]/10';

  return (
    <div className={cn('rounded-2xl border p-4 space-y-2', sticky && 'sticky bottom-20', tone)}>
      <div className="flex justify-between text-[14px]">
        <span className="app-muted">Cout total recette</span>
        <span className="font-semibold app-text">{money(summary.totalCost)}</span>
      </div>
      {portions && portions > 1 && (
        <div className="flex justify-between text-[14px]">
          <span className="app-muted">Cout / portion</span>
          <span className="font-semibold app-text">{money(summary.totalCost / portions)}</span>
        </div>
      )}
      <div className="flex justify-between text-[14px]">
        <span className="app-muted">Marge brute</span>
        <span className="font-semibold app-text">{money(summary.grossMargin)}</span>
      </div>
      <div className="flex justify-between text-[15px]">
        <span className="font-semibold app-text">Food cost</span>
        <span className="font-bold app-text">{(summary.foodCostRate * 100).toFixed(1)}%</span>
      </div>
      {summary.foodCostRate > 0.3 && (
        <p className="text-[13px] font-semibold text-[color:var(--app-danger)]">
          Alerte: le food cost depasse 30% du prix de vente.
        </p>
      )}
      {lastSavedRate !== undefined && (
        <p className="text-[12px] app-muted">
          Dernier calcul en base: {(lastSavedRate * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}
