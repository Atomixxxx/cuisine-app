import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EU_ALLERGENS,
  type Ingredient,
  type PriceHistory,
  type Recipe,
  type RecipeCostSummary,
  type RecipeIngredient,
  type RecipeUnit,
} from '../../types';
import { cn, validateRange } from '../../utils';
import { useAppStore } from '../../stores/appStore';
import { showError, showSuccess } from '../../stores/toastStore';
import { computeRecipeCostFromLines, calculateRecipeCost, getEffectiveUnitPrice } from '../../services/recipeCost';
import {
  parseRecipeFromText,
  parseRecipeFromImage,
  generateRecipeTemplateFromLine,
  searchIngredientPrices,
  type RecipeAiCatalogIngredient,
  type GeneratedRecipeTemplate,
} from '../../services/recipeAi';
import { normalizeName, nameSimilarity } from '../../services/ingredientMatch';
import { computeAutoRecipeAllergens, mergeRecipeAllergens } from '../../services/recipeAllergens';
import IngredientLineEditor from './IngredientLineEditor';
import CostSummaryBar from './CostSummaryBar';

interface RecipeLineDraft {
  id: string;
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: RecipeUnit;
}

const DEFAULT_SUMMARY: RecipeCostSummary = { totalCost: 0, grossMargin: 0, foodCostRate: 0, warningLevel: 'ok' };

interface RecipeEditorProps {
  recipe: Recipe | null;
  ingredients: Ingredient[];
  priceHistory: PriceHistory[];
  onClose: () => void;
  onSaved: (recipeId: string) => void;
  onDeleted: () => void;
  onOpenAiImport: () => void;
}

export default function RecipeEditor({
  recipe,
  ingredients,
  priceHistory,
  onClose,
  onSaved,
  onDeleted,
}: RecipeEditorProps) {
  const getRecipeIngredients = useAppStore((s) => s.getRecipeIngredients);
  const saveRecipeWithIngredients = useAppStore((s) => s.saveRecipeWithIngredients);
  const deleteRecipe = useAppStore((s) => s.deleteRecipe);
  const addIngredientStore = useAppStore((s) => s.addIngredient);

  // Show creation wizard for new recipes
  const [showCreationWizard, setShowCreationWizard] = useState(!recipe);
  const [creationMode, setCreationMode] = useState<'text' | 'photo' | 'generate' | null>(null);
  const [creationInput, setCreationInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(recipe?.title || '');
  const [portions, setPortions] = useState(String(recipe?.portions || 1));
  const [salePriceHT, setSalePriceHT] = useState(recipe?.salePriceHT ? String(recipe.salePriceHT) : '');
  const [manualAllergens, setManualAllergens] = useState<string[]>(recipe?.allergens ?? []);
  const [createdAt] = useState<Date>(recipe ? new Date(recipe.createdAt) : new Date());
  const [lines, setLines] = useState<RecipeLineDraft[]>([]);
  const [lastSavedSummary, setLastSavedSummary] = useState<RecipeCostSummary>(DEFAULT_SUMMARY);
  const [showAllergens, setShowAllergens] = useState(false);
  const [localIngredients, setLocalIngredients] = useState(ingredients);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  const ingredientMap = useMemo(() => new Map(localIngredients.map((i) => [i.id, i])), [localIngredients]);
  const supplierQuickPicks = useMemo(() => {
    const names = [
      ...localIngredients.map((i) => i.supplierId || ''),
      ...priceHistory.map((e) => e.supplier || ''),
    ].map((v) => v.trim()).filter(Boolean);
    return [...new Set(names)].slice(0, 8);
  }, [localIngredients, priceHistory]);

  const aiCatalog: RecipeAiCatalogIngredient[] = useMemo(
    () => localIngredients.filter((i) => i.unitPrice > 0).map((i) => ({ name: i.name, unit: i.unit, unitPrice: getEffectiveUnitPrice(i), supplierId: i.supplierId })),
    [localIngredients],
  );

  const parsedSalePrice = Number.parseFloat(salePriceHT);
  const normalizedSalePrice = Number.isFinite(parsedSalePrice) && parsedSalePrice > 0 ? parsedSalePrice : undefined;
  const parsedPortions = Math.max(1, Number.parseInt(portions, 10) || 1);
  const autoDetectedAllergens = useMemo(() => {
    const ingredientIds = lines.map((line) => line.ingredientId).filter(Boolean);
    return computeAutoRecipeAllergens(ingredientIds, ingredientMap);
  }, [lines, ingredientMap]);
  const mergedAllergens = useMemo(
    () => mergeRecipeAllergens(autoDetectedAllergens, manualAllergens),
    [autoDetectedAllergens, manualAllergens],
  );

  const liveSummary = useMemo(
    () =>
      computeRecipeCostFromLines(
        lines.filter((l) => l.ingredientId).map((l) => ({ ingredientId: l.ingredientId, requiredQuantity: l.requiredQuantity || 0, requiredUnit: l.requiredUnit })),
        ingredientMap,
        normalizedSalePrice,
      ),
    [lines, ingredientMap, normalizedSalePrice],
  );

  useEffect(() => {
    if (!recipe) return;
    (async () => {
      const linked = await getRecipeIngredients(recipe.id);
      setLines(linked.map((l) => ({ id: l.id, ingredientId: l.ingredientId, requiredQuantity: l.requiredQuantity, requiredUnit: l.requiredUnit })));
      const summary = await calculateRecipeCost(recipe.id);
      setLastSavedSummary(summary);
    })();
  }, [recipe, getRecipeIngredients]);

  useEffect(() => { setLocalIngredients(ingredients); }, [ingredients]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const similarity = nameSimilarity;

  // Apply a generated template to the editor: match or create ingredients, set prices
  const applyTemplate = async (template: GeneratedRecipeTemplate) => {
    setTitle(template.title);
    setPortions(String(template.portions));
    if (template.salePriceHT > 0) setSalePriceHT(String(template.salePriceHT));

    const currentIngredients = [...localIngredients];
    const newLines: RecipeLineDraft[] = [];
    const missingPrices: Array<{ name: string; unit: RecipeUnit; ingredientId: string }> = [];

    for (const item of template.ingredients) {
      // Try to find existing ingredient by similarity
      let bestMatch: Ingredient | null = null;
      let bestScore = 0;
      for (const ing of currentIngredients) {
        const s = similarity(item.name, ing.name);
        if (s > bestScore) { bestScore = s; bestMatch = ing; }
      }

      if (bestMatch && bestScore >= 0.78) {
        // Use existing ingredient
        newLines.push({ id: crypto.randomUUID(), ingredientId: bestMatch.id, requiredQuantity: item.quantity, requiredUnit: item.unit });
        if (bestMatch.unitPrice <= 0) {
          missingPrices.push({ name: bestMatch.name, unit: bestMatch.unit, ingredientId: bestMatch.id });
        }
      } else {
        // Create new ingredient (price unknown for now)
        const newId = crypto.randomUUID();
        const newIng: Ingredient = { id: newId, name: item.name, unit: item.unit, unitPrice: 0 };
        await addIngredientStore(newIng);
        currentIngredients.push(newIng);
        newLines.push({ id: crypto.randomUUID(), ingredientId: newId, requiredQuantity: item.quantity, requiredUnit: item.unit });
        missingPrices.push({ name: item.name, unit: item.unit, ingredientId: newId });
      }
    }

    setLines(newLines);
    setLocalIngredients(currentIngredients);
    setShowCreationWizard(false);
    setCreationMode(null);

    // Auto-search prices for ingredients without pricing
    if (missingPrices.length > 0) {
      setAnalyzeStatus(`Recherche des prix pour ${missingPrices.length} ingredient(s)...`);
      try {
        const estimates = await searchIngredientPrices(missingPrices.map((m) => ({ name: m.name, unit: m.unit })));
        const updateIngredient = useAppStore.getState().updateIngredient;
        let priced = 0;

        for (const est of estimates) {
          const matching = missingPrices.find((m) => normalizeName(m.name) === normalizeName(est.name));
          if (matching && est.bulkPrice > 0) {
            const existing = currentIngredients.find((i) => i.id === matching.ingredientId);
            if (existing && existing.unitPrice <= 0) {
              const updated: Ingredient = {
                ...existing,
                unitPrice: est.bulkPrice,
                conditioningQuantity: est.conditioningQuantity > 1 ? est.conditioningQuantity : undefined,
              };
              await updateIngredient(updated);
              const idx = currentIngredients.findIndex((i) => i.id === existing.id);
              if (idx >= 0) currentIngredients[idx] = updated;
              priced++;
            }
          }
        }

        setLocalIngredients([...currentIngredients]);
        if (priced > 0) {
          showSuccess(`${priced} prix estime(s) automatiquement`);
        }
      } catch {
        // Silent fail for price search
      }
      setAnalyzeStatus('');
    }

    setAnalyzeStatus('');
  };

  // --- Creation wizard handlers ---
  const handleParseText = async () => {
    if (!creationInput.trim()) { showError('Colle ou ecris ta recette'); return; }
    if (!isOnline) { showError("Mode hors ligne: l'IA n'est pas disponible"); return; }
    setAnalyzing(true);
    setAnalyzeStatus('Analyse de la recette...');
    try {
      const template = await parseRecipeFromText(creationInput, aiCatalog);
      if (template.ingredients.length === 0) { showError("L'IA n'a pas pu extraire d'ingredients"); return; }
      setAnalyzeStatus('Matching des ingredients et prix...');
      await applyTemplate(template);
      showSuccess('Recette analysee et pre-remplie');
    } catch { showError('Erreur lors de l\'analyse'); } finally { setAnalyzing(false); setAnalyzeStatus(''); }
  };

  const handleParsePhoto = async (file: File) => {
    if (!isOnline) { showError("Mode hors ligne: l'IA n'est pas disponible"); return; }
    setAnalyzing(true);
    setAnalyzeStatus('Lecture de la photo...');
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      const template = await parseRecipeFromImage(blob, aiCatalog);
      if (template.ingredients.length === 0) { showError("L'IA n'a pas pu lire la recette"); return; }
      setAnalyzeStatus('Matching des ingredients et prix...');
      await applyTemplate(template);
      showSuccess('Recette photo analysee et pre-remplie');
    } catch { showError('Erreur lors de la lecture photo'); } finally { setAnalyzing(false); setAnalyzeStatus(''); }
  };

  const handleGenerate = async () => {
    if (!creationInput.trim()) { showError('Decris ce que tu veux (ex: pate a crepes 1L)'); return; }
    if (!isOnline) { showError("Mode hors ligne: l'IA n'est pas disponible"); return; }
    setAnalyzing(true);
    setAnalyzeStatus('Generation de la recette...');
    try {
      const template = await generateRecipeTemplateFromLine(creationInput, { catalog: aiCatalog, targetFoodCostRate: 0.3, qualityGoal: 'premium' });
      if (template.ingredients.length === 0) { showError("L'IA n'a pas pu generer de recette"); return; }
      setAnalyzeStatus('Matching des ingredients et prix...');
      await applyTemplate(template);
      showSuccess('Recette generee et pre-remplie');
    } catch { showError('Erreur lors de la generation'); } finally { setAnalyzing(false); setAnalyzeStatus(''); }
  };

  const toggleAllergen = useCallback((allergen: string) => {
    setManualAllergens((prev) => prev.includes(allergen) ? prev.filter((v) => v !== allergen) : [...prev, allergen]);
  }, []);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ingredientId: localIngredients[0]?.id || '', requiredQuantity: 0, requiredUnit: localIngredients[0]?.unit || 'g' },
    ]);
  };

  const updateLine = (lineId: string, patch: Partial<RecipeLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  };

  const removeLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { showError('Le titre est obligatoire'); return; }
    if (normalizedSalePrice !== undefined) {
      const priceErr = validateRange(normalizedSalePrice, 0, 99999, 'Le prix de vente');
      if (priceErr) { showError(priceErr); return; }
    }
    const portionsErr = validateRange(parsedPortions, 1, 9999, 'Les portions');
    if (portionsErr) { showError(portionsErr); return; }

    setSaving(true);
    try {
      const now = new Date();
      const recipeId = recipe?.id || crypto.randomUUID();
      const recipeData: Recipe = {
        id: recipeId,
        title: trimmedTitle,
        portions: parsedPortions,
        salePriceHT: normalizedSalePrice,
        createdAt,
        updatedAt: now,
        allergens: mergedAllergens,
      };
      const linkedLines: RecipeIngredient[] = lines
        .filter((l) => l.ingredientId && l.requiredQuantity > 0)
        .map((l) => ({ id: l.id || crypto.randomUUID(), recipeId, ingredientId: l.ingredientId, requiredQuantity: l.requiredQuantity, requiredUnit: l.requiredUnit }));

      await saveRecipeWithIngredients(recipeData, linkedLines);
      showSuccess('Fiche technique enregistree');
      onSaved(recipeId);
    } catch {
      showError("Impossible d'enregistrer la fiche");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!recipe) return;
    if (!window.confirm('Supprimer cette fiche technique ?')) return;
    try { await deleteRecipe(recipe.id); showSuccess('Fiche supprimee'); onDeleted(); } catch { showError('Impossible de supprimer la fiche'); }
  };

  const handleIngredientCreated = async () => {
    const refreshed = await useAppStore.getState().getIngredients();
    setLocalIngredients(refreshed);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col app-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 app-surface border-b border-[color:var(--app-border)]">
        <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center gap-1 app-muted active:opacity-70">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className="ios-body">Retour</span>
        </button>
        <h2 className="ios-title3 app-text">{recipe ? recipe.title : 'Nouvelle fiche'}</h2>
        {!showCreationWizard && (
          <button onClick={() => { void handleSave(); }} disabled={saving}
            className={cn('min-h-[44px] px-4 ios-body font-semibold active:opacity-70', saving ? 'app-muted' : 'app-accent')}>
            {saving ? 'Sauvegarde...' : 'Sauver'}
          </button>
        )}
        {showCreationWizard && <div className="w-[44px]" />}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className={cn('flex-1 min-h-0 overflow-y-auto', showCreationWizard ? 'pb-28' : 'pb-6')}>
          <div className="app-page-wrap max-w-2xl space-y-3 pt-3 pb-4">

          {/* ===== CREATION WIZARD (new recipe only) ===== */}
          {showCreationWizard && !creationMode && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <h2 className="text-[20px] font-bold app-text">Comment veux-tu creer ta fiche ?</h2>
                <p className="text-[14px] app-muted mt-1">L'IA analyse et pre-remplit tout pour toi</p>
                {!isOnline && <p className="ios-caption text-[color:var(--app-warning)] mt-1">Mode hors ligne: creation manuelle uniquement</p>}
              </div>

              {/* Option 1: Paste/write recipe */}
              <button
                onClick={() => setCreationMode('text')}
                disabled={!isOnline}
                className={cn(
                  'w-full rounded-2xl app-card p-5 text-left active:opacity-70 space-y-1',
                  !isOnline && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl app-accent-bg flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold app-text">Coller / ecrire une recette</p>
                    <p className="ios-caption app-muted">Colle ta recette en texte, l'IA extrait les ingredients et les prix</p>
                  </div>
                </div>
              </button>

              {/* Option 2: Photo */}
              <button
                onClick={() => { setCreationMode('photo'); setTimeout(() => photoInputRef.current?.click(), 100); }}
                disabled={!isOnline}
                className={cn(
                  'w-full rounded-2xl app-card p-5 text-left active:opacity-70 space-y-1',
                  !isOnline && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl app-warning-bg flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold app-text">Photo d'une recette</p>
                    <p className="ios-caption app-muted">Prends en photo une recette papier ou ecran</p>
                  </div>
                </div>
              </button>

              {/* Option 3: AI generate */}
              <button
                onClick={() => setCreationMode('generate')}
                disabled={!isOnline}
                className={cn(
                  'w-full rounded-2xl app-card p-5 text-left active:opacity-70 space-y-1',
                  !isOnline && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl app-success-bg flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold app-text">Generer par IA</p>
                    <p className="ios-caption app-muted">Ex: "pate a crepes 1L", "tiramisu 8 parts"</p>
                  </div>
                </div>
              </button>

              {/* Skip wizard */}
              <button
                onClick={() => { setShowCreationWizard(false); setCreationMode(null); }}
                className="w-full py-3 text-[14px] app-muted font-medium active:opacity-70"
              >
                Creer manuellement
              </button>
            </div>
          )}

          {/* TEXT input mode */}
          {showCreationWizard && creationMode === 'text' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setCreationMode(null)} className="text-[14px] app-muted active:opacity-70">Retour</button>
                <h3 className="text-[17px] font-semibold app-text">Colle ta recette</h3>
              </div>
              <textarea
                value={creationInput}
                onChange={(e) => setCreationInput(e.target.value)}
                rows={8}
                placeholder={"Ex:\nPate a crepes (1 litre)\n250g farine\n4 oeufs\n500ml lait\n50g beurre fondu\n1 pincee de sel\n30g sucre"}
                className="w-full px-4 py-3 rounded-xl app-surface-2 app-text ios-body border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)] resize-y"
                autoFocus
              />
              {analyzeStatus && <p className="ios-caption app-accent font-medium animate-pulse">{analyzeStatus}</p>}
              <button
                onClick={() => { void handleParseText(); }}
                disabled={analyzing || !isOnline}
                className={cn(
                  'w-full py-3 rounded-xl text-[16px] font-semibold active:opacity-70',
                  (analyzing || !isOnline) ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
                )}
              >
                {analyzing ? 'Analyse en cours...' : 'Analyser la recette'}
              </button>
            </div>
          )}

          {/* PHOTO input mode */}
          {showCreationWizard && creationMode === 'photo' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setCreationMode(null)} className="text-[14px] app-muted active:opacity-70">Retour</button>
                <h3 className="text-[17px] font-semibold app-text">Photo de recette</h3>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleParsePhoto(f); e.target.value = ''; }}
                className="hidden"
              />
              {analyzeStatus && <p className="ios-caption app-accent font-medium animate-pulse">{analyzeStatus}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={analyzing || !isOnline}
                  className={cn(
                    'flex-1 py-3 rounded-xl ios-body font-semibold active:opacity-70',
                    (analyzing || !isOnline) ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
                  )}
                >
                  {analyzing ? 'Analyse...' : 'Prendre une photo'}
                </button>
              </div>
            </div>
          )}

          {/* GENERATE mode */}
          {showCreationWizard && creationMode === 'generate' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setCreationMode(null)} className="text-[14px] app-muted active:opacity-70">Retour</button>
                <h3 className="text-[17px] font-semibold app-text">Generer par IA</h3>
              </div>
              <input
                type="text"
                value={creationInput}
                onChange={(e) => setCreationInput(e.target.value)}
                placeholder="Ex: pate a crepes 1L, tiramisu 8 parts..."
                className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void handleGenerate(); }}
              />
              {analyzeStatus && <p className="ios-caption app-accent font-medium animate-pulse">{analyzeStatus}</p>}
              <button
                onClick={() => { void handleGenerate(); }}
                disabled={analyzing || !isOnline}
                className={cn(
                  'w-full py-3 rounded-xl text-[16px] font-semibold active:opacity-70',
                  (analyzing || !isOnline) ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
                )}
              >
                {analyzing ? 'Generation en cours...' : 'Generer la recette'}
              </button>
            </div>
          )}

          {/* ===== RECIPE FORM (shown after wizard or when editing) ===== */}
          {!showCreationWizard && (
            <>
              {/* Title + portions + price */}
              <div className="rounded-2xl app-card overflow-hidden">
                <div className="ios-settings-row flex-col items-stretch gap-1.5">
                  <label className="text-[16px] font-semibold app-text">Titre</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Burger maison"
                    className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]" />
                </div>
                <div className="ios-settings-separator" />
                <div className="ios-settings-row grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[14px] app-muted">Portions</label>
                    <input type="number" min="1" value={portions} onChange={(e) => setPortions(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[14px] app-muted">Prix vente HT (optionnel)</label>
                    <input type="number" min="0" step="0.01" value={salePriceHT} onChange={(e) => setSalePriceHT(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Allergens */}
              <div className="rounded-2xl app-card overflow-hidden">
                <button onClick={() => setShowAllergens(!showAllergens)}
                  className="w-full ios-settings-row flex items-center justify-between active:opacity-70">
                  <span className="text-[14px] app-muted">
                    Allergenes {mergedAllergens.length > 0 ? `(${mergedAllergens.length})` : ''}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className={cn('h-4 w-4 app-muted transition-transform', showAllergens && 'rotate-90')} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                {showAllergens && (
                  <div className="px-4 pb-3 space-y-2">
                    {autoDetectedAllergens.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[12px] app-muted">Auto-detectes</p>
                        <div className="flex flex-wrap gap-1.5">
                          {autoDetectedAllergens.map((allergen) => (
                            <span key={`auto-${allergen}`} className="px-2.5 py-1 rounded-full text-[12px] font-semibold app-warning-bg">
                              {allergen}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[12px] app-muted">Manuels</p>
                    <div className="flex flex-wrap gap-1.5">
                      {EU_ALLERGENS.map((allergen) => (
                        <button key={allergen} type="button" aria-pressed={manualAllergens.includes(allergen)}
                          onClick={() => toggleAllergen(allergen)}
                          className={cn('px-2.5 py-1 rounded-full text-[12px] font-semibold active:opacity-70', manualAllergens.includes(allergen) ? 'app-accent-bg' : 'app-surface-2 app-text')}>
                          {allergen}
                        </button>
                      ))}
                    </div>
                    {manualAllergens.length > 0 && (
                      <button type="button" onClick={() => setManualAllergens([])}
                        className="text-[12px] font-semibold text-[color:var(--app-accent)] active:opacity-70">Effacer tout</button>
                    )}
                  </div>
                )}
                {!showAllergens && mergedAllergens.length > 0 && (
                  <p className="px-4 pb-3 text-[12px] app-muted">{mergedAllergens.join(', ')}</p>
                )}
              </div>

              {/* Ingredient lines */}
              <div className="rounded-2xl app-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold app-text">Ingredients</h2>
                  <button onClick={addLine} className="px-3 py-1.5 rounded-lg app-accent-bg ios-caption font-semibold active:opacity-70">+ Ajouter</button>
                </div>
                {lines.length === 0 && <p className="text-[14px] app-muted">Aucun ingredient pour le moment.</p>}
                <div className="space-y-2">
                  {lines.map((line) => (
                    <IngredientLineEditor key={line.id} line={line} ingredients={localIngredients} ingredientMap={ingredientMap}
                      supplierQuickPicks={supplierQuickPicks} onUpdate={updateLine} onRemove={removeLine}
                      onIngredientCreated={() => { void handleIngredientCreated(); }} />
                  ))}
                </div>
              </div>

            </>
          )}
        </div>
      </div>
        {!showCreationWizard && (
          <div className="border-t border-[color:var(--app-border)] app-surface px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="app-page-wrap max-w-2xl space-y-2">
              <CostSummaryBar
                summary={liveSummary}
                portions={parsedPortions}
                salePriceHT={normalizedSalePrice}
                lastSavedRate={lastSavedSummary.foodCostRate}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { void handleSave(); }}
                  disabled={saving}
                  className={cn(
                    'flex-1 py-3 rounded-xl text-[16px] font-semibold active:opacity-70',
                    saving ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
                  )}
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer la fiche'}
                </button>
                {recipe && (
                  <button
                    onClick={() => { void handleDelete(); }}
                    className="px-4 py-3 rounded-xl app-danger-bg ios-body font-semibold active:opacity-70"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
