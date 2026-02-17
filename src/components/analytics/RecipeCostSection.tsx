import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { Ingredient, Recipe, RecipeIngredient } from '../../types';
import AnalyticsKpiRow, { type AnalyticsKpiItem } from './AnalyticsKpiRow';
import { computeAllRecipeCosts, computeTopExpensiveIngredients } from '../../services/analyticsEngine';
import { cn } from '../../utils';

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export default function RecipeCostSection() {
  const getRecipes = useAppStore((s) => s.getRecipes);
  const getIngredients = useAppStore((s) => s.getIngredients);
  const getRecipeIngredients = useAppStore((s) => s.getRecipeIngredients);

  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [links, setLinks] = useState<RecipeIngredient[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const [recipeRows, ingredientRows] = await Promise.all([getRecipes(), getIngredients()]);
        const ingredientLinks = await Promise.all(recipeRows.map((recipe) => getRecipeIngredients(recipe.id)));
        if (cancelled) return;
        setRecipes(recipeRows);
        setIngredients(ingredientRows);
        setLinks(ingredientLinks.flat());
      } catch {
        if (!cancelled) showError('Impossible de charger les indicateurs recettes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [getRecipes, getIngredients, getRecipeIngredients]);

  const costRows = useMemo(() => computeAllRecipeCosts(recipes, links, ingredients), [recipes, links, ingredients]);
  const rowsWithSalePrice = useMemo(
    () => costRows.filter((row) => Number.isFinite(row.salePriceHT) && (row.salePriceHT ?? 0) > 0),
    [costRows],
  );
  const topIngredients = useMemo(() => computeTopExpensiveIngredients(costRows, 5), [costRows]);
  const sortedByFoodCost = useMemo(
    () => [...costRows].sort((a, b) => b.foodCostRate - a.foodCostRate),
    [costRows],
  );

  const avgFoodCostRate =
    rowsWithSalePrice.length > 0
      ? rowsWithSalePrice.reduce((sum, row) => sum + row.foodCostRate, 0) / rowsWithSalePrice.length
      : 0;
  const recipesInDanger = rowsWithSalePrice.filter((row) => row.foodCostRate > 0.3).length;
  const bestMarginRow = costRows.reduce((best, row) => (row.grossMargin > best.grossMargin ? row : best), {
    recipeId: '',
    recipeTitle: 'Aucune',
    salePriceHT: undefined,
    totalCost: 0,
    grossMargin: -Infinity,
    foodCostRate: 0,
    warningLevel: 'ok' as const,
    ingredientCosts: [],
  });

  const kpiItems: AnalyticsKpiItem[] = [
    { label: 'Nb recettes', value: costRows.length },
    {
      label: 'Food cost moyen',
      value: `${Math.round(avgFoodCostRate * 100)}%`,
      color:
        avgFoodCostRate > 0.3
          ? 'var(--app-danger)'
          : avgFoodCostRate > 0.25
            ? 'var(--app-warning)'
            : 'var(--app-success)',
    },
    { label: 'Recettes en danger', value: recipesInDanger, color: recipesInDanger > 0 ? 'var(--app-danger)' : 'var(--app-success)' },
    {
      label: 'Meilleure marge',
      value: Number.isFinite(bestMarginRow.grossMargin) ? formatEuro(Math.max(0, bestMarginRow.grossMargin)) : formatEuro(0),
      sub: bestMarginRow.recipeTitle,
      color: 'var(--app-success)',
    },
  ];

  return (
    <section className="glass-card glass-panel space-y-4 animate-fade-in-up">
      <div>
        <h2 className="ios-title3 app-text">Recettes</h2>
        <p className="ios-caption app-muted">Food cost, marges et ingredients les plus couteux.</p>
      </div>

      <AnalyticsKpiRow items={kpiItems} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="ios-caption-upper">Classement par food cost</h3>
          {loading && <span className="ios-small app-muted">Chargement...</span>}
        </div>
        {sortedByFoodCost.length === 0 ? (
          <p className="dash-empty-inline">Aucune recette disponible.</p>
        ) : (
          <div className="space-y-2">
            {sortedByFoodCost.map((row) => {
              const ratePct = Math.round(row.foodCostRate * 100);
              const toneClass =
                row.warningLevel === 'danger'
                  ? 'bg-[color:var(--app-danger)]'
                  : row.warningLevel === 'warning'
                    ? 'bg-[color:var(--app-warning)]'
                    : 'bg-[color:var(--app-success)]';
              const textTone =
                row.warningLevel === 'danger'
                  ? 'text-[color:var(--app-danger)]'
                  : row.warningLevel === 'warning'
                    ? 'text-[color:var(--app-warning)]'
                    : 'text-[color:var(--app-success)]';
              const barWidth = Math.min(100, Math.max(0, ratePct));

              return (
                <div key={row.recipeId} className="rounded-2xl app-card px-3 py-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[14px] font-semibold app-text truncate">{row.recipeTitle}</p>
                    <div className="text-right shrink-0">
                      <p className={cn('text-[13px] font-bold', textTone)}>{ratePct}%</p>
                      <p className="ios-small app-muted">{formatEuro(row.grossMargin)}</p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full app-surface-3 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-[width] duration-300', toneClass)} style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="ios-caption-upper">Top 5 ingredients les plus couteux</h3>
        {topIngredients.length === 0 ? (
          <p className="dash-empty-inline">Aucun ingredient agrege pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {topIngredients.map((item) => (
              <div key={item.name} className="rounded-2xl app-card px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold app-text truncate">{item.name}</p>
                  <p className="ios-small app-muted">{item.recipeCount} recette(s)</p>
                </div>
                <p className="text-[13px] font-bold text-[color:var(--app-warning)] shrink-0">{formatEuro(item.totalCost)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
