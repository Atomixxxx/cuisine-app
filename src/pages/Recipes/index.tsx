import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError } from '../../stores/toastStore';
import type { Ingredient, PriceHistory, Recipe, RecipeCostSummary } from '../../types';
import { calculateRecipeCost } from '../../services/recipeCost';
import RecipeList from '../../components/recipes/RecipeList';

const RecipeEditor = lazy(() => import('../../components/recipes/RecipeEditor'));
const AiImportWizard = lazy(() => import('../../components/recipes/AiImportWizard'));

type View = 'list' | 'editor' | 'ai';

const DEFAULT_SUMMARY: RecipeCostSummary = { totalCost: 0, grossMargin: 0, foodCostRate: 0, warningLevel: 'ok' };

export default function RecipesPage() {
  const getIngredients = useAppStore((s) => s.getIngredients);
  const getRecipes = useAppStore((s) => s.getRecipes);
  const getPriceHistory = useAppStore((s) => s.getPriceHistory);

  const [view, setView] = useState<View>('list');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [costMap, setCostMap] = useState<Map<string, RecipeCostSummary>>(new Map());
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [showAiWizard, setShowAiWizard] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [loadedIngredients, loadedRecipes, loadedPriceHistory] = await Promise.all([
        getIngredients(),
        getRecipes(),
        getPriceHistory(),
      ]);
      setIngredients(loadedIngredients);
      setRecipes(loadedRecipes);
      setPriceHistory(loadedPriceHistory);

      // Calculate cost summaries for all recipes
      const newCostMap = new Map<string, RecipeCostSummary>();
      for (const recipe of loadedRecipes) {
        try {
          const summary = await calculateRecipeCost(recipe.id);
          newCostMap.set(recipe.id, summary);
        } catch {
          newCostMap.set(recipe.id, DEFAULT_SUMMARY);
        }
      }
      setCostMap(newCostMap);
    } catch {
      showError('Impossible de charger les fiches techniques');
    }
  }, [getIngredients, getRecipes, getPriceHistory]);

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const [loadedIngredients, loadedRecipes, loadedPriceHistory] = await Promise.all([
          getIngredients(),
          getRecipes(),
          getPriceHistory(),
        ]);
        if (cancelled) return;
        setIngredients(loadedIngredients);
        setRecipes(loadedRecipes);
        setPriceHistory(loadedPriceHistory);

        const newCostMap = new Map<string, RecipeCostSummary>();
        for (const recipe of loadedRecipes) {
          try {
            const summary = await calculateRecipeCost(recipe.id);
            newCostMap.set(recipe.id, summary);
          } catch {
            newCostMap.set(recipe.id, DEFAULT_SUMMARY);
          }
        }
        if (!cancelled) setCostMap(newCostMap);
      } catch {
        if (!cancelled) showError('Impossible de charger les fiches techniques');
      }
    };

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [getIngredients, getPriceHistory, getRecipes]);

  const handleSelectRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setView('editor');
  };

  const handleNewRecipe = () => {
    setEditingRecipe(null);
    setView('editor');
  };

  const handleEditorClose = () => {
    setView('list');
    setEditingRecipe(null);
  };

  const handleRecipeSaved = () => {
    void loadData();
    setView('list');
    setEditingRecipe(null);
  };

  const handleRecipeDeleted = () => {
    void loadData();
    setView('list');
    setEditingRecipe(null);
  };

  const handleOpenAiImport = () => {
    setShowAiWizard(true);
  };

  const handleAiRecipeCreated = () => {
    void loadData();
    setShowAiWizard(false);
  };

  return (
    <div className="app-page-wrap pb-28">
      {view === 'list' && (
        <RecipeList
          recipes={recipes}
          costMap={costMap}
          onSelectRecipe={handleSelectRecipe}
          onNewRecipe={handleNewRecipe}
          onOpenAiImport={handleOpenAiImport}
        />
      )}

      {view === 'editor' && (
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <RecipeEditor
            recipe={editingRecipe}
            ingredients={ingredients}
            priceHistory={priceHistory}
            onClose={handleEditorClose}
            onSaved={handleRecipeSaved}
            onDeleted={handleRecipeDeleted}
            onOpenAiImport={handleOpenAiImport}
          />
        </Suspense>
      )}

      {showAiWizard && (
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <AiImportWizard
            isOpen={showAiWizard}
            onClose={() => setShowAiWizard(false)}
            ingredients={ingredients}
            priceHistory={priceHistory}
            recipes={recipes}
            onRecipeCreated={handleAiRecipeCreated}
          />
        </Suspense>
      )}
    </div>
  );
}
