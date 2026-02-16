import { useMemo, useState } from 'react';
import type { Recipe, RecipeCostSummary } from '../../types';
import RecipeCard from './RecipeCard';
import EmptyState from '../common/EmptyState';

type SortMode = 'name' | 'foodcost' | 'date';

interface RecipeListProps {
  recipes: Recipe[];
  costMap: Map<string, RecipeCostSummary>;
  onSelectRecipe: (recipe: Recipe) => void;
  onNewRecipe: () => void;
  onOpenAiImport: () => void;
}

export default function RecipeList({ recipes, costMap, onSelectRecipe, onNewRecipe, onOpenAiImport }: RecipeListProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('date');

  const avgFoodCost = useMemo(() => {
    if (recipes.length === 0) return 0;
    let total = 0;
    let count = 0;
    for (const r of recipes) {
      const s = costMap.get(r.id);
      if (s && s.foodCostRate > 0) {
        total += s.foodCostRate;
        count += 1;
      }
    }
    return count > 0 ? total / count : 0;
  }, [recipes, costMap]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : [...recipes];

    list.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      if (sort === 'foodcost') {
        const fa = costMap.get(a.id)?.foodCostRate ?? 0;
        const fb = costMap.get(b.id)?.foodCostRate ?? 0;
        return fb - fa;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }, [recipes, search, sort, costMap]);

  const DEFAULT_SUMMARY: RecipeCostSummary = { totalCost: 0, grossMargin: 0, foodCostRate: 0, warningLevel: 'ok' };

  return (
    <div className="space-y-3">
      {/* Hero */}
      <div className="app-hero-card space-y-2">
        <h1 className="ios-title app-text">Fiches techniques</h1>
        <p className="ios-body app-muted">
          {recipes.length > 0
            ? `${recipes.length} fiche${recipes.length > 1 ? 's' : ''} · Food cost moyen: ${(avgFoodCost * 100).toFixed(1)}%`
            : 'Recettes, cout matiere et food cost en temps reel.'}
        </p>
      </div>

      {/* Search + Sort */}
      {recipes.length > 0 && (
        <div className="app-panel p-3 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une fiche..."
            className="w-full px-4 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
          />
          <div className="flex gap-2">
            {(['date', 'name', 'foodcost'] as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSort(mode)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold active:opacity-70 ${
                  sort === mode ? 'app-accent-bg' : 'app-surface-2 app-text'
                }`}
              >
                {mode === 'date' ? 'Recent' : mode === 'name' ? 'Nom' : 'Food cost'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recipe cards */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              title={recipe.title}
              portions={recipe.portions}
              salePriceHT={recipe.salePriceHT}
              summary={costMap.get(recipe.id) || DEFAULT_SUMMARY}
              allergens={recipe.allergens}
              onClick={() => onSelectRecipe(recipe)}
            />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          }
          title="Aucune fiche technique"
          description="Cree ta premiere fiche pour suivre tes couts matiere."
          action={
            <button onClick={onNewRecipe} className="px-6 py-3 rounded-xl app-accent-bg ios-body font-semibold active:opacity-70">
              Creer une fiche
            </button>
          }
        />
      ) : (
        <div className="rounded-xl app-card p-4 text-center text-[14px] app-muted">
          Aucun resultat pour "{search}"
        </div>
      )}

      {/* AI import button */}
      {recipes.length > 0 && (
        <button
          onClick={onOpenAiImport}
          className="w-full py-3 rounded-xl app-surface-2 app-text text-[14px] font-semibold active:opacity-70"
        >
          Importer via IA
        </button>
      )}

      {/* FAB */}
      <button
        onClick={onNewRecipe}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full app-accent-bg flex items-center justify-center shadow-lg active:opacity-70"
        aria-label="Nouvelle fiche"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  );
}

