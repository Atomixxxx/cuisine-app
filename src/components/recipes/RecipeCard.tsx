import { memo } from 'react';
import type { RecipeCostSummary } from '../../types';
import { cn } from '../../utils';

function money(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

interface RecipeCardProps {
  title: string;
  portions: number;
  salePriceHT?: number;
  summary: RecipeCostSummary;
  allergens?: string[];
  onClick: () => void;
}

function RecipeCardComponent({ title, portions, salePriceHT, summary, allergens, onClick }: RecipeCardProps) {
  const hasSalePrice = Number.isFinite(salePriceHT) && (salePriceHT ?? 0) > 0;
  const costPerPortion = portions > 0 ? summary.totalCost / portions : summary.totalCost;
  const badgeColor =
    !hasSalePrice
      ? 'bg-[color:var(--app-surface-2)] app-text border border-[color:var(--app-border)]'
      : summary.warningLevel === 'danger'
        ? 'bg-[color:var(--app-danger)] text-white'
        : summary.warningLevel === 'warning'
          ? 'bg-[color:var(--app-warning)] text-white'
          : 'bg-[color:var(--app-success)] text-white';

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl app-card p-4 space-y-2 active:opacity-70 transition-opacity"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[16px] font-semibold app-text truncate flex-1">{title}</h3>
        <span className={cn('px-2.5 py-0.5 rounded-full text-[12px] font-bold shrink-0', badgeColor)}>
          {hasSalePrice ? `${(summary.foodCostRate * 100).toFixed(0)}%` : 'Cout'}
        </span>
      </div>
      <p className="ios-caption app-muted">
        {portions} portion{portions > 1 ? 's' : ''}
        {hasSalePrice ? ` - ${money(salePriceHT ?? 0)} HT` : ''}
      </p>
      <div className="flex gap-3 text-[12px] app-muted">
        <span>Cout: {money(summary.totalCost)}</span>
        {hasSalePrice ? <span>Marge: {money(summary.grossMargin)}</span> : <span>Cout/portion: {money(costPerPortion)}</span>}
      </div>
      {allergens && allergens.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allergens.map((a) => (
            <span key={a} className="px-2 py-0.5 rounded-full app-surface-2 text-[10px] font-semibold app-muted">
              {a}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

const RecipeCard = memo(RecipeCardComponent);

export default RecipeCard;
