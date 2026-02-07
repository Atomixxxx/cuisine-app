import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { showError, showSuccess } from '../../stores/toastStore';
import type {
  Ingredient,
  IngredientUnit,
  PriceHistory,
  Recipe,
  RecipeCostSummary,
  RecipeIngredient,
  RecipeUnit,
  SupplierLineResolution,
} from '../../types';
import { cn } from '../../utils';
import { calculateRecipeCost, computeRecipeCostFromLines } from '../../services/recipeCost';
import { resolveSupplierLine, upsertSupplierProductMapping } from '../../services/supplierMapping';
import { generateRecipeTemplateFromLine } from '../../services/recipeAi';
import { buildSupplierQuickPicks, canonicalizeSupplierName } from '../../services/suppliers';

type ViewMode = 'recipes' | 'ingredients';

interface RecipeLineDraft {
  id: string;
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: RecipeUnit;
}

type ReviewDraftSource = 'ai' | 'mapping';
type ReviewPriceSource = 'ingredient' | 'cadencier' | 'manual' | 'none';

interface RecipeReviewLine {
  id: string;
  ingredientId: string;
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit: RecipeUnit;
  unitPrice: number;
  supplierId: string;
  priceSource: ReviewPriceSource;
  confidence: number;
}

interface RecipeReviewDraft {
  source: ReviewDraftSource;
  title: string;
  portions: number;
  salePriceHT: number;
  lines: RecipeReviewLine[];
  feedback: string;
  supplierLine?: {
    label: string;
    supplierId?: string;
    supplierSku?: string;
    quantityRatio: number;
    confidence: number;
  };
}

interface BatchImportRow {
  label: string;
  supplierId?: string;
  supplierSku?: string;
  ratio?: number;
}

const UNITS: RecipeUnit[] = ['kg', 'g', 'l', 'ml', 'unite'];

const DEFAULT_SUMMARY: RecipeCostSummary = {
  totalCost: 0,
  grossMargin: 0,
  foodCostRate: 0,
  warningLevel: 'ok',
};

function money(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

export default function RecipesPage() {
  const getIngredients = useAppStore((s) => s.getIngredients);
  const addIngredient = useAppStore((s) => s.addIngredient);
  const updateIngredient = useAppStore((s) => s.updateIngredient);
  const deleteIngredient = useAppStore((s) => s.deleteIngredient);
  const getRecipes = useAppStore((s) => s.getRecipes);
  const getRecipeIngredients = useAppStore((s) => s.getRecipeIngredients);
  const saveRecipeWithIngredients = useAppStore((s) => s.saveRecipeWithIngredients);
  const deleteRecipe = useAppStore((s) => s.deleteRecipe);
  const getPriceHistory = useAppStore((s) => s.getPriceHistory);

  const [mode, setMode] = useState<ViewMode>('recipes');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [lastSavedSummary, setLastSavedSummary] = useState<RecipeCostSummary>(DEFAULT_SUMMARY);

  const [title, setTitle] = useState('');
  const [portions, setPortions] = useState('1');
  const [salePriceHT, setSalePriceHT] = useState('0');
  const [createdAt, setCreatedAt] = useState<Date>(new Date());
  const [lines, setLines] = useState<RecipeLineDraft[]>([]);

  const [ingredientName, setIngredientName] = useState('');
  const [ingredientUnit, setIngredientUnit] = useState<IngredientUnit>('kg');
  const [ingredientUnitPrice, setIngredientUnitPrice] = useState('');
  const [ingredientSupplier, setIngredientSupplier] = useState('');
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [supplierIdInput, setSupplierIdInput] = useState('');
  const [supplierSkuInput, setSupplierSkuInput] = useState('');
  const [supplierLabelInput, setSupplierLabelInput] = useState('');
  const [quantityRatioInput, setQuantityRatioInput] = useState('1');
  const [resolvedSuggestion, setResolvedSuggestion] = useState<SupplierLineResolution | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [resolverFeedback, setResolverFeedback] = useState('');
  const [resolvingSuggestion, setResolvingSuggestion] = useState(false);
  const [importingFromSupplier, setImportingFromSupplier] = useState(false);
  const [generatingFromAi, setGeneratingFromAi] = useState(false);
  const [batchGeneratingFromAi, setBatchGeneratingFromAi] = useState(false);
  const [supplierBatchInput, setSupplierBatchInput] = useState('');
  const [supplierBatchRows, setSupplierBatchRows] = useState<BatchImportRow[]>([]);
  const [reviewDraft, setReviewDraft] = useState<RecipeReviewDraft | null>(null);
  const [reviewQueue, setReviewQueue] = useState<RecipeReviewDraft[]>([]);
  const [reviewSortMode, setReviewSortMode] = useState<'risk' | 'name'>('risk');
  const [applyingReviewDraft, setApplyingReviewDraft] = useState(false);
  const [savingReviewDraft, setSavingReviewDraft] = useState(false);
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSupplierMapping, setPendingSupplierMapping] = useState<{
    supplierId?: string;
    supplierSku?: string;
    label: string;
    templateRecipeId: string;
    quantityRatio: number;
    confidence: number;
  } | null>(null);

  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const supplierQuickPicks = useMemo(() => {
    const dynamicSuppliers = [
      ...ingredients.map((ingredient) => ingredient.supplierId || ''),
      ...priceHistory.map((entry) => entry.supplier || ''),
    ]
      .map((value) => value.trim())
      .filter(Boolean);
    return buildSupplierQuickPicks(dynamicSuppliers);
  }, [ingredients, priceHistory]);
  const aiCatalog = useMemo(
    () =>
      ingredients
        .filter((ingredient) => ingredient.unitPrice > 0)
        .map((ingredient) => ({
          name: ingredient.name,
          unit: ingredient.unit,
          unitPrice: ingredient.unitPrice,
          supplierId: ingredient.supplierId,
        })),
    [ingredients],
  );
  const parsedSalePrice = Number.parseFloat(salePriceHT) || 0;
  const parsedPortions = Math.max(1, Number.parseInt(portions, 10) || 1);

  const liveSummary = useMemo(
    () =>
      computeRecipeCostFromLines(
        lines
          .filter((line) => line.ingredientId)
          .map((line) => ({
            ingredientId: line.ingredientId,
            requiredQuantity: line.requiredQuantity || 0,
            requiredUnit: line.requiredUnit,
          })),
        ingredientMap,
        parsedSalePrice,
      ),
    [lines, ingredientMap, parsedSalePrice],
  );

  const summaryTone =
    liveSummary.warningLevel === 'danger'
      ? 'border-[color:var(--app-danger)]/40 bg-[color:var(--app-danger)]/10'
      : liveSummary.warningLevel === 'warning'
        ? 'border-[color:var(--app-warning)]/40 bg-[color:var(--app-warning)]/10'
        : 'border-[color:var(--app-success)]/40 bg-[color:var(--app-success)]/10';

  const convertQuantity = (value: number, fromUnit: RecipeUnit, toUnit: RecipeUnit): number | null => {
    if (fromUnit === toUnit) return value;
    if (fromUnit === 'g' && toUnit === 'kg') return value / 1000;
    if (fromUnit === 'kg' && toUnit === 'g') return value * 1000;
    if (fromUnit === 'ml' && toUnit === 'l') return value / 1000;
    if (fromUnit === 'l' && toUnit === 'ml') return value * 1000;
    return null;
  };

  const reviewSummary = useMemo(() => {
    if (!reviewDraft) return null;
    const totalCost = reviewDraft.lines.reduce((sum, line) => {
      const linkedIngredient = line.ingredientId ? ingredientMap.get(line.ingredientId) : undefined;
      const priceUnit = linkedIngredient?.unit || line.requiredUnit;
      const convertedQuantity = convertQuantity(line.requiredQuantity, line.requiredUnit, priceUnit);
      if (convertedQuantity === null || convertedQuantity < 0 || !Number.isFinite(convertedQuantity)) return sum;
      const unitPrice = linkedIngredient?.unitPrice && linkedIngredient.unitPrice > 0 ? linkedIngredient.unitPrice : line.unitPrice;
      return sum + convertedQuantity * Math.max(0, unitPrice || 0);
    }, 0);

    const safeSalePrice = Number.isFinite(reviewDraft.salePriceHT) && reviewDraft.salePriceHT > 0 ? reviewDraft.salePriceHT : 0;
    const foodCostRate = safeSalePrice > 0 ? totalCost / safeSalePrice : 0;
    const grossMargin = safeSalePrice - totalCost;
    const warningLevel: RecipeCostSummary['warningLevel'] =
      foodCostRate > 0.3 ? 'danger' : foodCostRate > 0.25 ? 'warning' : 'ok';
    return { totalCost, grossMargin, foodCostRate, warningLevel };
  }, [reviewDraft, ingredientMap]);

  const reviewSummaryTone =
    reviewSummary?.warningLevel === 'danger'
      ? 'border-[color:var(--app-danger)]/40 bg-[color:var(--app-danger)]/10'
      : reviewSummary?.warningLevel === 'warning'
        ? 'border-[color:var(--app-warning)]/40 bg-[color:var(--app-warning)]/10'
        : 'border-[color:var(--app-success)]/40 bg-[color:var(--app-success)]/10';

  const lowConfidenceCount = reviewDraft?.lines.filter((line) => line.confidence < 0.75).length || 0;

  const clampConfidence = (value: number): number => Math.max(0, Math.min(1, value));

  const scoreToConfidenceLabel = (score: number): string => {
    if (score >= 0.9) return 'Haute';
    if (score >= 0.75) return 'Moyenne';
    return 'Basse';
  };

  const startNewRecipe = useCallback(() => {
    setSelectedRecipeId(null);
    setTitle('');
    setPortions('1');
    setSalePriceHT('0');
    setCreatedAt(new Date());
    setLines([]);
    setLastSavedSummary(DEFAULT_SUMMARY);
    setReviewDraft(null);
    setReviewQueue([]);
    setSupplierBatchRows([]);
    setPendingSupplierMapping(null);
  }, []);

  const openRecipe = useCallback(
    async (recipe: Recipe) => {
      setSelectedRecipeId(recipe.id);
      setTitle(recipe.title);
      setPortions(String(recipe.portions));
      setSalePriceHT(String(recipe.salePriceHT));
      setCreatedAt(new Date(recipe.createdAt));

      const linked = await getRecipeIngredients(recipe.id);
      setLines(
        linked.map((line) => ({
          id: line.id,
          ingredientId: line.ingredientId,
          requiredQuantity: line.requiredQuantity,
          requiredUnit: line.requiredUnit,
        })),
      );
      setReviewDraft(null);
      setReviewQueue([]);
      setSupplierBatchRows([]);
      setPendingSupplierMapping(null);

      const summary = await calculateRecipeCost(recipe.id);
      setLastSavedSummary(summary);
    },
    [getRecipeIngredients],
  );

  const loadData = useCallback(
    async (preferredRecipeId?: string | null) => {
      try {
        const [loadedIngredients, loadedRecipes, loadedPriceHistory] = await Promise.all([
          getIngredients(),
          getRecipes(),
          getPriceHistory(),
        ]);
        setIngredients(loadedIngredients);
        setRecipes(loadedRecipes);
        setPriceHistory(loadedPriceHistory);

        if (loadedRecipes.length === 0) {
          startNewRecipe();
          return;
        }

        const selected =
          loadedRecipes.find((r) => r.id === preferredRecipeId) ||
          loadedRecipes.find((r) => r.id === selectedRecipeId) ||
          loadedRecipes[0];
        if (selected) await openRecipe(selected);
      } catch {
        showError('Impossible de charger les fiches techniques');
      }
    },
    [getIngredients, getRecipes, getPriceHistory, openRecipe, selectedRecipeId, startNewRecipe],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetIngredientForm = () => {
    setIngredientName('');
    setIngredientUnit('kg');
    setIngredientUnitPrice('');
    setIngredientSupplier('');
    setEditingIngredientId(null);
  };

  const handleSaveIngredient = async () => {
    const name = ingredientName.trim();
    const unitPrice = Number.parseFloat(ingredientUnitPrice);
    if (!name) {
      showError("Le nom de l'ingredient est obligatoire");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      showError('Le prix unitaire doit etre superieur a 0');
      return;
    }

    const payload: Ingredient = {
      id: editingIngredientId || crypto.randomUUID(),
      name,
      unit: ingredientUnit,
      unitPrice,
      supplierId: ingredientSupplier.trim() || undefined,
    };

    try {
      if (editingIngredientId) await updateIngredient(payload);
      else await addIngredient(payload);
      showSuccess(editingIngredientId ? 'Ingredient mis a jour' : 'Ingredient ajoute');
      resetIngredientForm();
      await loadData(selectedRecipeId);
    } catch {
      showError("Impossible d'enregistrer l'ingredient");
    }
  };

  const handleEditIngredient = (ingredient: Ingredient) => {
    setMode('ingredients');
    setEditingIngredientId(ingredient.id);
    setIngredientName(ingredient.name);
    setIngredientUnit(ingredient.unit);
    setIngredientUnitPrice(String(ingredient.unitPrice));
    setIngredientSupplier(ingredient.supplierId || '');
  };

  const handleDeleteIngredient = async (id: string) => {
    if (!window.confirm('Supprimer cet ingredient ?')) return;
    try {
      await deleteIngredient(id);
      showSuccess('Ingredient supprime');
      await loadData(selectedRecipeId);
    } catch {
      showError("Impossible de supprimer l'ingredient");
    }
  };

  const normalizeName = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const similarity = (left: string, right: string): number => {
    const a = normalizeName(left);
    const b = normalizeName(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.92;

    const aTokens = new Set(a.split(' '));
    const bTokens = new Set(b.split(' '));
    let intersection = 0;
    for (const token of aTokens) if (bTokens.has(token)) intersection += 1;
    const union = aTokens.size + bTokens.size - intersection;
    return union === 0 ? 0 : intersection / union;
  };

  const findBestIngredientMatch = (name: string, list: Ingredient[]): { ingredient: Ingredient | null; score: number } => {
    let best: Ingredient | null = null;
    let bestScore = 0;
    for (const ingredient of list) {
      const score = similarity(name, ingredient.name);
      if (score > bestScore) {
        bestScore = score;
        best = ingredient;
      }
    }
    return { ingredient: bestScore >= 0.78 ? best : null, score: bestScore };
  };

  const findBestCadencierMatch = (name: string): { entry: PriceHistory | null; score: number } => {
    let best: PriceHistory | null = null;
    let bestScore = 0;
    for (const entry of priceHistory) {
      const score = similarity(name, entry.itemName);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return { entry: bestScore >= 0.72 ? best : null, score: bestScore };
  };

  const buildAiReviewDraft = async (
    label: string,
    ratio: number,
    supplierMeta?: { supplierId?: string; supplierSku?: string },
  ): Promise<RecipeReviewDraft | null> => {
    const generated = await generateRecipeTemplateFromLine(label, {
      salePriceHT: parsedSalePrice > 0 ? parsedSalePrice : undefined,
      targetFoodCostRate: 0.3,
      qualityGoal: 'premium',
      catalog: aiCatalog,
    });
    if (!generated.ingredients.length) return null;

    const draftedLines: RecipeReviewLine[] = [];
    let matchedCount = 0;
    let cadencierCount = 0;
    let noPriceCount = 0;
    let newIngredientCount = 0;

    for (const item of generated.ingredients) {
      const scaledQuantity = Math.round(item.quantity * ratio * 1000) / 1000;
      if (scaledQuantity <= 0) continue;

      const ingredientMatch = findBestIngredientMatch(item.name, ingredients);
      const ingredient = ingredientMatch.ingredient;
      const cadencierMatch = findBestCadencierMatch(item.name);
      const cadencierHit = cadencierMatch.entry;

      let priceSource: ReviewPriceSource = 'none';
      let unitPrice = 0;
      if (ingredient?.unitPrice && ingredient.unitPrice > 0) {
        unitPrice = ingredient.unitPrice;
        priceSource = 'ingredient';
        matchedCount += 1;
      } else if (cadencierHit?.averagePrice && cadencierHit.averagePrice > 0) {
        unitPrice = cadencierHit.averagePrice;
        priceSource = 'cadencier';
        cadencierCount += 1;
      } else {
        noPriceCount += 1;
      }

      if (!ingredient) newIngredientCount += 1;
      const confidence =
        ingredient
          ? clampConfidence(0.65 + ingredientMatch.score * 0.35)
          : cadencierHit
            ? clampConfidence(0.45 + cadencierMatch.score * 0.35)
            : 0.5;

      draftedLines.push({
        id: crypto.randomUUID(),
        ingredientId: ingredient?.id || '',
        ingredientName: ingredient?.name || item.name,
        requiredQuantity: scaledQuantity,
        requiredUnit: ingredient?.unit || item.unit,
        unitPrice,
        supplierId: ingredient?.supplierId || cadencierHit?.supplier || '',
        priceSource,
        confidence,
      });
    }

    if (!draftedLines.length) return null;

    const safePortions = Math.max(1, Math.round(generated.portions || 1));
    const safeSalePrice = generated.salePriceHT > 0 ? generated.salePriceHT : parsedSalePrice;
    const avgConfidence =
      draftedLines.length > 0 ? draftedLines.reduce((sum, line) => sum + line.confidence, 0) / draftedLines.length : 0.8;

    return {
      source: 'ai',
      title: generated.title || label,
      portions: safePortions,
      salePriceHT: safeSalePrice,
      lines: draftedLines,
      feedback: `Brouillon IA pret: ${matchedCount} ingredient(s) deja relies, ${cadencierCount} prix importes du cadencier, ${newIngredientCount} ingredient(s) a creer, ${noPriceCount} sans prix.`,
      supplierLine: {
        label,
        supplierId: supplierMeta?.supplierId,
        supplierSku: supplierMeta?.supplierSku,
        quantityRatio: ratio,
        confidence: clampConfidence(0.6 + avgConfidence * 0.4),
      },
    };
  };

  const handleGenerateFromAi = async () => {
    const label = supplierLabelInput.trim();
    if (!label) {
      showError('Renseigne le libelle API pour lancer la generation IA');
      return;
    }
    const ratio = Number.parseFloat(quantityRatioInput);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      showError('Le ratio de quantite doit etre superieur a 0');
      return;
    }

    setGeneratingFromAi(true);
    try {
      const nextDraft = await buildAiReviewDraft(label, ratio, {
        supplierId: supplierIdInput.trim() || undefined,
        supplierSku: supplierSkuInput.trim() || undefined,
      });
      if (!nextDraft) {
        showError("Aucune ligne recette n'a pu etre generee");
        return;
      }

      setReviewDraft(nextDraft);
      setReviewQueue([]);
      setPendingSupplierMapping(null);
      setResolvedSuggestion(null);
      setSelectedTemplateId('');

      setResolverFeedback('Generation IA terminee. Verifie le brouillon puis applique.');
      showSuccess('Generation IA terminee. Validation humaine requise.');
    } catch {
      showError("Impossible de generer la recette avec l'IA");
    } finally {
      setGeneratingFromAi(false);
    }
  };

  const handleGenerateBatchFromAi = async () => {
    const globalRatio = Number.parseFloat(quantityRatioInput);
    if (!Number.isFinite(globalRatio) || globalRatio <= 0) {
      showError('Le ratio de quantite doit etre superieur a 0');
      return;
    }

    const rows: BatchImportRow[] =
      supplierBatchRows.length > 0
        ? supplierBatchRows
        : supplierBatchInput
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((label): BatchImportRow => ({ label }));
    if (!rows.length) {
      showError('Renseigne au moins une ligne API dans le lot');
      return;
    }

    setBatchGeneratingFromAi(true);
    try {
      const drafts: RecipeReviewDraft[] = [];
      let failedCount = 0;

      for (const row of rows) {
        const rowRatio = Number.isFinite(row.ratio || NaN) && (row.ratio || 0) > 0 ? (row.ratio as number) : globalRatio;
        const draft = await buildAiReviewDraft(row.label, rowRatio, {
          supplierId: row.supplierId || supplierIdInput.trim() || undefined,
          supplierSku: row.supplierSku || supplierSkuInput.trim() || undefined,
        });
        if (draft) drafts.push(draft);
        else failedCount += 1;
      }

      if (!drafts.length) {
        showError('Aucun brouillon exploitable genere sur le lot');
        return;
      }

      setReviewDraft(drafts[0]);
      setReviewQueue(drafts.slice(1));
      setPendingSupplierMapping(null);
      setResolvedSuggestion(null);
      setSelectedTemplateId('');

      const okCount = drafts.length;
      setResolverFeedback(
        `Lot IA charge: ${okCount} brouillon(s) pret(s), ${failedCount} ligne(s) ignoree(s). Valide puis enregistre chaque brouillon.`,
      );
      showSuccess(`Lot IA: ${okCount} brouillon(s) charge(s).`);
    } catch {
      showError('Impossible de generer le lot IA');
    } finally {
      setBatchGeneratingFromAi(false);
    }
  };

  const parsePositiveNumber = (value: unknown): number | undefined => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.').trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
  };

  const normalizeHeader = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const parseDelimitedLine = (line: string, delimiter: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && char === delimiter) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    return values.map((cell) => cell.replace(/^"|"$/g, '').trim());
  };

  const toBatchRowFromObject = (input: Record<string, unknown>): BatchImportRow | null => {
    const labelValue = input.label ?? input.libelle ?? input.name ?? input.produit ?? input.item ?? input.designation;
    if (typeof labelValue !== 'string' || !labelValue.trim()) return null;
    const supplierValue = input.supplierId ?? input.supplier ?? input.fournisseur;
    const skuValue = input.sku ?? input.supplierSku ?? input.reference ?? input.ref;
    const ratioValue = input.ratio ?? input.quantityRatio ?? input.qteRatio ?? input.coefficient;
    return {
      label: labelValue.trim(),
      supplierId: typeof supplierValue === 'string' && supplierValue.trim() ? supplierValue.trim() : undefined,
      supplierSku: typeof skuValue === 'string' && skuValue.trim() ? skuValue.trim() : undefined,
      ratio: parsePositiveNumber(ratioValue),
    };
  };

  const parseSupplierRowsFromFileContent = (fileName: string, content: string): BatchImportRow[] => {
    const normalizedName = fileName.toLowerCase();
    if (normalizedName.endsWith('.json')) {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry): BatchImportRow | null => {
          if (typeof entry === 'string') return { label: entry.trim() };
          if (!entry || typeof entry !== 'object') return null;
          return toBatchRowFromObject(entry as Record<string, unknown>);
        })
        .filter((row): row is BatchImportRow => Boolean(row && row.label));
    }

    const rawLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!rawLines.length) return [];

    const delimiter = rawLines.some((line) => line.includes(';'))
      ? ';'
      : rawLines.some((line) => line.includes('\t'))
        ? '\t'
        : ',';

    const headerCells = parseDelimitedLine(rawLines[0], delimiter).map(normalizeHeader);
    const detectIndex = (aliases: string[]): number => headerCells.findIndex((cell) => aliases.includes(cell));
    const labelIndex = detectIndex(['label', 'libelle', 'produit', 'item', 'designation', 'nom']);
    const supplierIndex = detectIndex(['supplier', 'supplierid', 'fournisseur', 'provider']);
    const skuIndex = detectIndex(['sku', 'suppliersku', 'reference', 'ref']);
    const ratioIndex = detectIndex(['ratio', 'quantityratio', 'qteratio', 'coefficient']);
    const hasHeader = labelIndex >= 0 || supplierIndex >= 0 || skuIndex >= 0 || ratioIndex >= 0;

    const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
    if (!dataLines.length) return [];
    return dataLines
      .map((line): BatchImportRow | null => {
        const cells = parseDelimitedLine(line, delimiter);
        const rawLabel = labelIndex >= 0 ? cells[labelIndex] || '' : cells[0] || '';
        const label = rawLabel.trim();
        if (!label) return null;
        const supplierId = supplierIndex >= 0 ? (cells[supplierIndex] || '').trim() : '';
        const supplierSku = skuIndex >= 0 ? (cells[skuIndex] || '').trim() : '';
        const ratioRaw = ratioIndex >= 0 ? cells[ratioIndex] : undefined;
        return {
          label,
          supplierId: supplierId || undefined,
          supplierSku: supplierSku || undefined,
          ratio: parsePositiveNumber(ratioRaw),
        };
      })
      .filter((row): row is BatchImportRow => Boolean(row && row.label));
  };

  const syncBatchRowsToText = (rows: BatchImportRow[]) => {
    setSupplierBatchRows(rows);
    setSupplierBatchInput(rows.map((row) => row.label).join('\n'));
    const firstWithMetadata = rows.find((row) => row.supplierId || row.supplierSku || row.ratio);
    if (firstWithMetadata?.supplierId) setSupplierIdInput(canonicalizeSupplierName(firstWithMetadata.supplierId));
    if (firstWithMetadata?.supplierSku) setSupplierSkuInput(firstWithMetadata.supplierSku);
    if (firstWithMetadata?.ratio) setQuantityRatioInput(String(firstWithMetadata.ratio));
  };

  const handleBatchTextChange = (value: string) => {
    setSupplierBatchInput(value);
    const rows: BatchImportRow[] = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label): BatchImportRow => ({ label }));
    setSupplierBatchRows(rows);
  };

  const handleBatchFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const rows = parseSupplierRowsFromFileContent(file.name, content);
      if (!rows.length) {
        showError("Aucune ligne fournisseur exploitable dans le fichier");
        return;
      }
      syncBatchRowsToText(rows);
      const enrichedRows = rows.filter((row) => row.supplierId || row.supplierSku || row.ratio).length;
      showSuccess(`${rows.length} ligne(s) importee(s), ${enrichedRows} avec supplier/sku/ratio.`);
    } catch {
      showError("Impossible de lire le fichier d'import lot");
    } finally {
      event.target.value = '';
    }
  };

  const handleBatchJsonPaste = () => {
    const text = supplierBatchInput.trim();
    if (!text.startsWith('[') && !text.startsWith('{')) {
      showError('Le contenu actuel ne ressemble pas a du JSON');
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const rows = (Array.isArray(parsed) ? parsed : [parsed])
        .map((entry): BatchImportRow | null => {
          if (typeof entry === 'string') return { label: entry.trim() };
          if (!entry || typeof entry !== 'object') return null;
          return toBatchRowFromObject(entry as Record<string, unknown>);
        })
        .filter((row): row is BatchImportRow => Boolean(row && row.label));
      if (!rows.length) {
        showError('JSON valide mais aucun label exploitable');
        return;
      }
      syncBatchRowsToText(rows);
      showSuccess(`${rows.length} ligne(s) JSON parsee(s)`);
    } catch {
      showError('JSON invalide');
    }
  };

  const sortReviewLines = (mode: 'risk' | 'name') => {
    setReviewSortMode(mode);
    setReviewDraft((prev) => {
      if (!prev) return prev;
      const sorted = [...prev.lines];
      if (mode === 'risk') {
        sorted.sort((a, b) => a.confidence - b.confidence || a.ingredientName.localeCompare(b.ingredientName));
      } else {
        sorted.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
      }
      return { ...prev, lines: sorted };
    });
  };

  const handleResolveSupplier = async () => {
    const supplierId = supplierIdInput.trim();
    const label = supplierLabelInput.trim();
    if (!label) {
      showError('Renseigne le libelle API');
      return;
    }
    setResolvingSuggestion(true);
    try {
      const resolution = await resolveSupplierLine({
        supplierId: supplierId || undefined,
        supplierSku: supplierSkuInput.trim() || undefined,
        label,
      });
      if (!resolution) {
        setResolvedSuggestion(null);
        setResolverFeedback('Aucune suggestion auto trouvee. Selectionne un template manuellement.');
        return;
      }
      setResolvedSuggestion(resolution);
      setSelectedTemplateId(resolution.templateRecipeId);
      setQuantityRatioInput(String(resolution.quantityRatio));
      const confidence = Math.round(resolution.confidence * 100);
      setResolverFeedback(
        resolution.source === 'exact'
          ? `Mapping exact trouve (${confidence}% de confiance).`
          : `Suggestion auto trouvee (${confidence}% de confiance).`,
      );
    } catch {
      showError('Erreur pendant la recherche de template');
    } finally {
      setResolvingSuggestion(false);
    }
  };

  const handleImportAndRemember = async () => {
    const supplierId = supplierIdInput.trim();
    const label = supplierLabelInput.trim();
    const templateRecipeId = selectedTemplateId.trim();
    const ratio = Number.parseFloat(quantityRatioInput);

    if (!label) {
      showError('Renseigne le libelle API');
      return;
    }
    if (!templateRecipeId) {
      showError('Selectionne un template');
      return;
    }
    if (!Number.isFinite(ratio) || ratio <= 0) {
      showError('Le ratio de quantite doit etre superieur a 0');
      return;
    }

    const template = recipes.find((recipe) => recipe.id === templateRecipeId);
    if (!template) {
      showError('Template introuvable');
      return;
    }

    setImportingFromSupplier(true);
    try {
      const templateLines = await getRecipeIngredients(templateRecipeId);
      if (!templateLines.length) {
        showError('Le template selectionne ne contient aucun ingredient');
        return;
      }

      const draftedLines: RecipeReviewLine[] = templateLines.map((line) => {
        const ingredient = ingredientMap.get(line.ingredientId);
        return {
          id: crypto.randomUUID(),
          ingredientId: line.ingredientId,
          ingredientName: ingredient?.name || 'Ingredient',
          requiredQuantity: Math.round(line.requiredQuantity * ratio * 1000) / 1000,
          requiredUnit: line.requiredUnit,
          unitPrice: ingredient?.unitPrice || 0,
          supplierId: ingredient?.supplierId || '',
          priceSource: ingredient?.unitPrice && ingredient.unitPrice > 0 ? 'ingredient' : 'none',
          confidence: ingredient?.unitPrice && ingredient.unitPrice > 0 ? 0.95 : 0.82,
        };
      });

      setReviewDraft({
        source: 'mapping',
        title: label,
        portions: Math.max(1, template.portions),
        salePriceHT: Math.max(0, template.salePriceHT),
        lines: draftedLines,
        feedback: 'Template charge. Valide les quantites/prix puis applique au formulaire.',
        supplierLine: {
          label,
          supplierId: supplierId || undefined,
          supplierSku: supplierSkuInput.trim() || undefined,
          quantityRatio: ratio,
          confidence: resolvedSuggestion?.confidence ?? 0.95,
        },
      });
      setReviewQueue([]);
      setPendingSupplierMapping({
        supplierId: supplierId || undefined,
        supplierSku: supplierSkuInput.trim() || undefined,
        label,
        templateRecipeId,
        quantityRatio: ratio,
        confidence: resolvedSuggestion?.confidence ?? 0.95,
      });

      setResolverFeedback('Template importe. Valide puis applique pour memoriser le mapping.');
      showSuccess('Template importe dans le brouillon de validation.');
    } catch {
      showError("Impossible d'importer la ligne fournisseur");
    } finally {
      setImportingFromSupplier(false);
    }
  };

  const updateReviewLine = (lineId: string, patch: Partial<RecipeReviewLine>) => {
    setReviewDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
      };
    });
  };

  const removeReviewLine = (lineId: string) => {
    setReviewDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, lines: prev.lines.filter((line) => line.id !== lineId) };
    });
  };

  const addReviewLine = () => {
    setReviewDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: [
          ...prev.lines,
          {
            id: crypto.randomUUID(),
            ingredientId: '',
            ingredientName: '',
            requiredQuantity: 0,
            requiredUnit: 'unite',
            unitPrice: 0,
            supplierId: '',
            priceSource: 'manual',
            confidence: 0.5,
          },
        ],
      };
    });
  };

  const materializeReviewLines = async (sourceLines: RecipeReviewLine[]) => {
    const nextIngredients = [...ingredients];
    const nextRecipeLines: RecipeLineDraft[] = [];

    for (const line of sourceLines) {
      const linked = line.ingredientId ? nextIngredients.find((entry) => entry.id === line.ingredientId) : undefined;
      if (linked) {
        if (linked.unitPrice <= 0 && line.unitPrice > 0) {
          const patched: Ingredient = {
            ...linked,
            unitPrice: line.unitPrice,
            supplierId: linked.supplierId || line.supplierId || undefined,
          };
          await updateIngredient(patched);
          const index = nextIngredients.findIndex((entry) => entry.id === linked.id);
          if (index >= 0) nextIngredients[index] = patched;
        }

        nextRecipeLines.push({
          id: crypto.randomUUID(),
          ingredientId: linked.id,
          requiredQuantity: line.requiredQuantity,
          requiredUnit: line.requiredUnit,
        });
        continue;
      }

      const name = line.ingredientName.trim();
      if (!name) {
        throw new Error('missing_ingredient_name');
      }
      const created: Ingredient = {
        id: crypto.randomUUID(),
        name,
        unit: line.requiredUnit,
        unitPrice: Math.max(0, line.unitPrice || 0),
        supplierId: line.supplierId.trim() || undefined,
      };
      await addIngredient(created);
      nextIngredients.push(created);

      nextRecipeLines.push({
        id: crypto.randomUUID(),
        ingredientId: created.id,
        requiredQuantity: line.requiredQuantity,
        requiredUnit: line.requiredUnit,
      });
    }

    return { nextIngredients, nextRecipeLines };
  };

  const handleApplyReviewDraft = async () => {
    if (!reviewDraft) return;
    if (reviewQueue.length > 0) {
      showError('En mode lot, utilise "Valider et enregistrer" pour traiter les brouillons en sequence');
      return;
    }
    const trimmedTitle = reviewDraft.title.trim();
    if (!trimmedTitle) {
      showError('Le titre est obligatoire dans la validation');
      return;
    }

    const filteredLines = reviewDraft.lines.filter((line) => line.requiredQuantity > 0);
    if (filteredLines.length === 0) {
      showError('Ajoute au moins une ligne ingredient avec une quantite > 0');
      return;
    }

    setApplyingReviewDraft(true);
    try {
      const { nextIngredients, nextRecipeLines } = await materializeReviewLines(filteredLines);

      if (pendingSupplierMapping) {
        await upsertSupplierProductMapping(pendingSupplierMapping);
      }

      setIngredients(nextIngredients);
      setSelectedRecipeId(null);
      setCreatedAt(new Date());
      setTitle(trimmedTitle);
      setPortions(String(Math.max(1, Math.round(reviewDraft.portions || 1))));
      setSalePriceHT(String(Math.max(0, reviewDraft.salePriceHT || 0)));
      setLines(nextRecipeLines);
      setLastSavedSummary(DEFAULT_SUMMARY);
      setReviewDraft(null);
      setPendingSupplierMapping(null);
      showSuccess('Brouillon valide et applique. Verifie puis enregistre la fiche.');
    } catch (error) {
      if (error instanceof Error && error.message === 'missing_ingredient_name') {
        showError('Un ingredient sans nom ne peut pas etre cree');
      } else {
        showError("Impossible d'appliquer le brouillon de validation");
      }
    } finally {
      setApplyingReviewDraft(false);
    }
  };

  const handleLoadNextReviewDraft = () => {
    if (reviewQueue.length === 0) {
      setReviewDraft(null);
      setPendingSupplierMapping(null);
      return;
    }
    const [next, ...rest] = reviewQueue;
    setReviewQueue(rest);
    setReviewDraft(next);
    setPendingSupplierMapping(null);
  };

  const handleSaveReviewDraft = async () => {
    if (!reviewDraft) return;
    const trimmedTitle = reviewDraft.title.trim();
    if (!trimmedTitle) {
      showError('Le titre est obligatoire dans la validation');
      return;
    }
    if (!Number.isFinite(reviewDraft.salePriceHT) || reviewDraft.salePriceHT <= 0) {
      showError('Le prix de vente HT doit etre superieur a 0 pour enregistrer');
      return;
    }

    const filteredLines = reviewDraft.lines.filter((line) => line.requiredQuantity > 0);
    if (!filteredLines.length) {
      showError('Ajoute au moins une ligne ingredient avec une quantite > 0');
      return;
    }

    setSavingReviewDraft(true);
    try {
      const { nextIngredients, nextRecipeLines } = await materializeReviewLines(filteredLines);
      const now = new Date();
      const recipeId = crypto.randomUUID();
      const recipe: Recipe = {
        id: recipeId,
        title: trimmedTitle,
        portions: Math.max(1, Math.round(reviewDraft.portions || 1)),
        salePriceHT: Math.max(0, reviewDraft.salePriceHT || 0),
        createdAt: now,
        updatedAt: now,
      };
      const linkedLines: RecipeIngredient[] = nextRecipeLines.map((line) => ({
        id: crypto.randomUUID(),
        recipeId,
        ingredientId: line.ingredientId,
        requiredQuantity: line.requiredQuantity,
        requiredUnit: line.requiredUnit,
      }));

      await saveRecipeWithIngredients(recipe, linkedLines);
      const mappingFromDraft = reviewDraft.supplierLine;
      if (mappingFromDraft) {
        await upsertSupplierProductMapping({
          supplierId: mappingFromDraft.supplierId,
          supplierSku: mappingFromDraft.supplierSku,
          label: mappingFromDraft.label,
          templateRecipeId: recipeId,
          quantityRatio: mappingFromDraft.quantityRatio,
          confidence: mappingFromDraft.confidence,
        });
      } else if (pendingSupplierMapping) {
        await upsertSupplierProductMapping({
          supplierId: pendingSupplierMapping.supplierId,
          supplierSku: pendingSupplierMapping.supplierSku,
          label: pendingSupplierMapping.label,
          templateRecipeId: recipeId,
          quantityRatio: pendingSupplierMapping.quantityRatio,
          confidence: pendingSupplierMapping.confidence,
        });
      }
      setIngredients(nextIngredients);

      if (reviewQueue.length > 0) {
        const [next, ...rest] = reviewQueue;
        setReviewQueue(rest);
        setReviewDraft(next);
        setPendingSupplierMapping(null);
        setResolverFeedback(`Fiche enregistree. ${rest.length + 1} brouillon(s) restant(s) dans le lot.`);
        showSuccess('Fiche enregistree. Brouillon suivant charge.');
      } else {
        setReviewDraft(null);
        setPendingSupplierMapping(null);
        setReviewQueue([]);
        const summary = await calculateRecipeCost(recipeId);
        setLastSavedSummary(summary);
        showSuccess('Fiche technique enregistree depuis la validation.');
        await loadData(recipeId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'missing_ingredient_name') {
        showError('Un ingredient sans nom ne peut pas etre cree');
      } else {
        showError("Impossible d'enregistrer ce brouillon");
      }
    } finally {
      setSavingReviewDraft(false);
    }
  };

  const addRecipeLine = () => {
    if (ingredients.length === 0) {
      showError('Ajoutez au moins un ingredient');
      return;
    }
    const firstIngredient = ingredients[0];
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ingredientId: firstIngredient.id,
        requiredQuantity: 0,
        requiredUnit: firstIngredient.unit,
      },
    ]);
  };

  const updateRecipeLine = (lineId: string, patch: Partial<RecipeLineDraft>) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const removeRecipeLine = (lineId: string) => {
    setLines((prev) => prev.filter((line) => line.id !== lineId));
  };

  const handleSaveRecipe = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showError('Le titre de la fiche est obligatoire');
      return;
    }
    if (!Number.isFinite(parsedSalePrice) || parsedSalePrice <= 0) {
      showError('Le prix de vente HT doit etre superieur a 0');
      return;
    }

    const now = new Date();
    const recipeId = selectedRecipeId || crypto.randomUUID();
    const recipe: Recipe = {
      id: recipeId,
      title: trimmedTitle,
      portions: parsedPortions,
      salePriceHT: parsedSalePrice,
      createdAt,
      updatedAt: now,
    };

    const linkedLines: RecipeIngredient[] = lines
      .filter((line) => line.ingredientId && line.requiredQuantity > 0)
      .map((line) => ({
        id: line.id || crypto.randomUUID(),
        recipeId,
        ingredientId: line.ingredientId,
        requiredQuantity: line.requiredQuantity,
        requiredUnit: line.requiredUnit,
      }));

    try {
      await saveRecipeWithIngredients(recipe, linkedLines);
      const summary = await calculateRecipeCost(recipeId);
      setLastSavedSummary(summary);
      showSuccess('Fiche technique enregistree');
      await loadData(recipeId);
    } catch {
      showError("Impossible d'enregistrer la fiche");
    }
  };

  const handleDeleteRecipe = async () => {
    if (!selectedRecipeId) return;
    if (!window.confirm('Supprimer cette fiche technique ?')) return;
    try {
      await deleteRecipe(selectedRecipeId);
      showSuccess('Fiche supprimee');
      await loadData(null);
    } catch {
      showError('Impossible de supprimer la fiche');
    }
  };

  return (
    <div className="app-page-wrap max-w-4xl pb-28 space-y-3">
      <div className="app-hero-card space-y-3">
        <div>
          <h1 className="ios-title app-text">Fiches techniques</h1>
          <p className="text-[15px] app-muted">Recettes, cout matiere et food cost en temps reel.</p>
        </div>
        <div className="app-kpi-grid">
          <div className="app-kpi-card">
            <p className="app-kpi-label">Fiches</p>
            <p className="app-kpi-value">{recipes.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Ingredients</p>
            <p className="app-kpi-value">{ingredients.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Lignes recette</p>
            <p className="app-kpi-value">{lines.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">A verifier</p>
            <p className="app-kpi-value">{lowConfidenceCount + reviewQueue.length}</p>
          </div>
        </div>
      </div>

      <div className="app-panel">
        <div className="ios-segmented">
          <button className={cn('ios-segmented-item', mode === 'recipes' && 'active')} onClick={() => setMode('recipes')}>
            Fiches
          </button>
          <button className={cn('ios-segmented-item', mode === 'ingredients' && 'active')} onClick={() => setMode('ingredients')}>
            Ingredients
          </button>
        </div>
      </div>

      {mode === 'recipes' && (
        <div className="space-y-4 pb-24">
          <div className="rounded-2xl app-card p-4 space-y-3">
            <div>
              <h2 className="text-[17px] font-semibold app-text">Generation IA et mapping</h2>
              <p className="text-[13px] app-muted mt-1">
                Ligne API recue - generation IA - ou mapping template memorise.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                value={supplierIdInput}
                onChange={(e) => setSupplierIdInput(e.target.value)}
                placeholder="Fournisseur (optionnel)"
                className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
              />
              <input
                type="text"
                value={supplierSkuInput}
                onChange={(e) => setSupplierSkuInput(e.target.value)}
                placeholder="SKU fournisseur (optionnel)"
                className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
              />
            </div>
            {supplierQuickPicks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {supplierQuickPicks.map((supplier) => (
                  <button
                    key={`supplier-pick-top-${supplier}`}
                    type="button"
                    onClick={() => setSupplierIdInput(canonicalizeSupplierName(supplier))}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[12px] font-semibold active:opacity-70',
                      supplierIdInput.trim().toLowerCase() === supplier.toLowerCase()
                        ? 'app-accent-bg'
                        : 'app-surface-2 app-text',
                    )}
                  >
                    {supplier}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              value={supplierLabelInput}
              onChange={(e) => setSupplierLabelInput(e.target.value)}
              placeholder='Ligne API recue (ex: "Pate Burger Brioche 4x100g")'
              className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
            />
            <textarea
              value={supplierBatchInput}
              onChange={(e) => handleBatchTextChange(e.target.value)}
              rows={3}
              placeholder={'Lot API (1 ligne par produit)\nEx:\nPate a burger 1kg\nSauce burger maison 2L'}
              className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none resize-y"
            />
            <div className="flex items-center gap-2">
              <input
                ref={batchFileInputRef}
                type="file"
                accept=".csv,.txt,.json"
                onChange={(e) => {
                  void handleBatchFileImport(e);
                }}
                className="hidden"
              />
              <button
                onClick={() => batchFileInputRef.current?.click()}
                className="px-3 py-2 rounded-lg app-surface-2 app-text text-[13px] font-semibold active:opacity-70"
              >
                Importer CSV/JSON
              </button>
              <button
                onClick={handleBatchJsonPaste}
                className="px-3 py-2 rounded-lg app-surface-2 app-text text-[13px] font-semibold active:opacity-70"
              >
                Parser JSON colle
              </button>
              <p className="text-[12px] app-muted">Formats: `.csv`, `.txt`, `.json` (1 libelle par ligne)</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr,140px] gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
              >
                <option value="">Selectionner un template</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.0001"
                step="0.01"
                value={quantityRatioInput}
                onChange={(e) => setQuantityRatioInput(e.target.value)}
                placeholder="Ratio"
                className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
              />
            </div>
            {resolverFeedback && (
              <p
                className={cn(
                  'text-[13px] font-medium',
                  resolvedSuggestion?.source === 'exact'
                    ? 'text-[color:var(--app-success)]'
                    : resolvedSuggestion?.source === 'fuzzy'
                      ? 'text-[color:var(--app-warning)]'
                      : 'app-muted',
                )}
              >
                {resolverFeedback}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button
                onClick={() => {
                  void handleGenerateFromAi();
                }}
                disabled={generatingFromAi}
                className={cn(
                  'py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70',
                  generatingFromAi ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-info-bg',
                )}
              >
                {generatingFromAi ? 'Generation...' : 'Generer avec IA'}
              </button>
              <button
                onClick={() => {
                  void handleResolveSupplier();
                }}
                disabled={resolvingSuggestion}
                className={cn(
                  'py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70',
                  resolvingSuggestion ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-warning-bg',
                )}
              >
                {resolvingSuggestion ? 'Recherche...' : 'Suggere template'}
              </button>
              <button
                onClick={() => {
                  void handleImportAndRemember();
                }}
                disabled={importingFromSupplier}
                className={cn(
                  'py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70',
                  importingFromSupplier ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
                )}
              >
                {importingFromSupplier ? 'Import...' : 'Importer et memoriser'}
              </button>
            </div>
            <button
              onClick={() => {
                void handleGenerateBatchFromAi();
              }}
              disabled={batchGeneratingFromAi}
              className={cn(
                'w-full py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70',
                batchGeneratingFromAi ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-info-bg',
              )}
            >
              {batchGeneratingFromAi ? 'Generation lot...' : 'Generer un lot IA'}
            </button>
          </div>

          {reviewDraft && (
            <div className="rounded-2xl app-card p-4 space-y-3 border border-[color:var(--app-accent)]/30">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[17px] font-semibold app-text">Validation humaine (1 ecran)</h2>
                  <p className="text-[13px] app-muted mt-1">
                    {reviewDraft.source === 'ai' ? 'Brouillon genere par IA' : 'Brouillon importe depuis template'}
                  </p>
                </div>
                <button
                  onClick={addReviewLine}
                  className="px-3 py-1.5 rounded-lg app-surface-2 app-text text-[13px] font-semibold active:opacity-70"
                >
                  + Ligne
                </button>
              </div>

              <p className="text-[13px] app-muted">{reviewDraft.feedback}</p>
              {reviewDraft.supplierLine && (
                <p className="text-[12px] app-muted">
                  Ligne source: {reviewDraft.supplierLine.label}
                  {reviewDraft.supplierLine.supplierId ? ` | Fournisseur: ${reviewDraft.supplierLine.supplierId}` : ''}
                  {reviewDraft.supplierLine.supplierSku ? ` | SKU: ${reviewDraft.supplierLine.supplierSku}` : ''}
                  {` | Ratio: ${reviewDraft.supplierLine.quantityRatio}`}
                </p>
              )}
              {reviewQueue.length > 0 && (
                <p className="text-[13px] font-semibold text-[color:var(--app-info)]">
                  File active: {reviewQueue.length + 1} brouillon(s) (incluant celui en cours).
                </p>
              )}
              {reviewQueue.length > 0 && (
                <p className="text-[12px] app-muted">
                  Mode lot actif: utilise "Valider et enregistrer" pour passer automatiquement au brouillon suivant.
                </p>
              )}
              {lowConfidenceCount > 0 && (
                <p className="text-[12px] font-semibold text-[color:var(--app-danger)]">
                  {lowConfidenceCount} ligne(s) a faible confiance a verifier en priorite.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => sortReviewLines('risk')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[12px] font-semibold active:opacity-70',
                    reviewSortMode === 'risk' ? 'app-warning-bg' : 'app-surface-2 app-text',
                  )}
                >
                  Trier par risque
                </button>
                <button
                  onClick={() => sortReviewLines('name')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[12px] font-semibold active:opacity-70',
                    reviewSortMode === 'name' ? 'app-accent-bg' : 'app-surface-2 app-text',
                  )}
                >
                  Trier par nom
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={reviewDraft.title}
                  onChange={(e) => setReviewDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  placeholder="Titre fiche"
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  value={reviewDraft.portions}
                  onChange={(e) =>
                    setReviewDraft((prev) =>
                      prev ? { ...prev, portions: Math.max(1, Number.parseInt(e.target.value, 10) || 1) } : prev,
                    )
                  }
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reviewDraft.salePriceHT}
                  onChange={(e) =>
                    setReviewDraft((prev) =>
                      prev ? { ...prev, salePriceHT: Math.max(0, Number.parseFloat(e.target.value) || 0) } : prev,
                    )
                  }
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                {reviewDraft.lines.map((line) => (
                  <div key={line.id} className="rounded-xl app-surface-2 p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={line.ingredientName}
                        onChange={(e) => updateReviewLine(line.id, { ingredientName: e.target.value })}
                        placeholder="Nom ingredient"
                        className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
                      />
                      <select
                        value={line.ingredientId}
                        onChange={(e) => {
                          const ingredientId = e.target.value;
                          const ingredient = ingredientMap.get(ingredientId);
                          updateReviewLine(line.id, {
                            ingredientId,
                            ingredientName: ingredient?.name || line.ingredientName,
                            requiredUnit: ingredient?.unit || line.requiredUnit,
                            unitPrice: ingredient?.unitPrice || line.unitPrice,
                            supplierId: ingredient?.supplierId || line.supplierId,
                            priceSource:
                              ingredient && ingredient.unitPrice > 0
                                ? 'ingredient'
                                : ingredientId
                                  ? 'manual'
                                  : line.priceSource,
                            confidence: ingredient ? 0.95 : line.confidence,
                          });
                        }}
                        className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
                      >
                        <option value="">Creer nouvel ingredient</option>
                        {ingredients.map((ingredient) => (
                          <option key={ingredient.id} value={ingredient.id}>
                            {ingredient.name} ({money(ingredient.unitPrice)}/{ingredient.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.requiredQuantity}
                        onChange={(e) =>
                          updateReviewLine(line.id, { requiredQuantity: Math.max(0, Number.parseFloat(e.target.value) || 0) })
                        }
                        placeholder="Quantite"
                        className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
                      />
                      <select
                        value={line.requiredUnit}
                        onChange={(e) => updateReviewLine(line.id, { requiredUnit: e.target.value as RecipeUnit })}
                        className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const nextPrice = Math.max(0, Number.parseFloat(e.target.value) || 0);
                          updateReviewLine(line.id, {
                            unitPrice: nextPrice,
                            priceSource: nextPrice > 0 ? 'manual' : line.priceSource,
                            confidence: nextPrice > 0 ? Math.max(line.confidence, 0.75) : line.confidence,
                          });
                        }}
                        placeholder="Prix unitaire"
                        className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={line.supplierId}
                        onChange={(e) => updateReviewLine(line.id, { supplierId: e.target.value })}
                        placeholder="Fournisseur (opt.)"
                        className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
                      />
                      {supplierQuickPicks.length > 0 && (
                        <div className="col-span-2 md:col-span-4 flex flex-wrap gap-1.5">
                          {supplierQuickPicks.map((supplier) => (
                            <button
                              key={`supplier-pick-line-${line.id}-${supplier}`}
                              type="button"
                              onClick={() => updateReviewLine(line.id, { supplierId: canonicalizeSupplierName(supplier) })}
                              className={cn(
                                'px-2 py-1 rounded-full text-[11px] font-semibold active:opacity-70',
                                line.supplierId.trim().toLowerCase() === supplier.toLowerCase()
                                  ? 'app-accent-bg'
                                  : 'app-surface-2 app-text',
                              )}
                            >
                              {supplier}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p
                        className={cn(
                          'text-[12px] font-semibold',
                          line.priceSource === 'ingredient'
                            ? 'text-[color:var(--app-success)]'
                            : line.priceSource === 'cadencier'
                              ? 'text-[color:var(--app-warning)]'
                              : line.unitPrice > 0
                                ? 'text-[color:var(--app-accent)]'
                                : 'text-[color:var(--app-danger)]',
                        )}
                      >
                        {line.priceSource === 'ingredient' && 'Prix source: ingredient existant'}
                        {line.priceSource === 'cadencier' && 'Prix source: cadencier'}
                        {line.priceSource === 'manual' && 'Prix source: saisi manuellement'}
                        {line.priceSource === 'none' && 'Prix manquant'}
                      </p>
                      <p
                        className={cn(
                          'text-[12px] font-semibold',
                          line.confidence >= 0.9
                            ? 'text-[color:var(--app-success)]'
                            : line.confidence >= 0.75
                              ? 'text-[color:var(--app-warning)]'
                              : 'text-[color:var(--app-danger)]',
                        )}
                      >
                        Confiance: {Math.round(line.confidence * 100)}% ({scoreToConfidenceLabel(line.confidence)})
                      </p>
                      <button
                        onClick={() => removeReviewLine(line.id)}
                        className="text-[12px] font-semibold text-[color:var(--app-danger)] active:opacity-70"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {reviewSummary && (
                <div className={cn('rounded-xl border p-3 space-y-1', reviewSummaryTone)}>
                  <div className="flex justify-between text-[13px]">
                    <span className="app-muted">Cout total brouillon</span>
                    <span className="font-semibold app-text">{money(reviewSummary.totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="app-muted">Marge brute</span>
                    <span className="font-semibold app-text">{money(reviewSummary.grossMargin)}</span>
                  </div>
                  <div className="flex justify-between text-[14px]">
                    <span className="font-semibold app-text">Food cost</span>
                    <span className="font-bold app-text">{(reviewSummary.foodCostRate * 100).toFixed(1)}%</span>
                  </div>
                  {reviewSummary.foodCostRate > 0.3 && (
                    <p className="text-[12px] font-semibold text-[color:var(--app-danger)]">
                      Alerte: le food cost depasse 30% du prix de vente.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    setReviewDraft(null);
                    setReviewQueue([]);
                    setPendingSupplierMapping(null);
                  }}
                  className="py-2.5 rounded-xl app-surface-2 app-text text-[14px] font-semibold active:opacity-70"
                >
                  Annuler brouillon
                </button>
                <button
                  onClick={() => {
                    void handleSaveReviewDraft();
                  }}
                  disabled={savingReviewDraft}
                  className={cn(
                    'py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70',
                    savingReviewDraft ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-success-bg',
                  )}
                >
                  {savingReviewDraft ? 'Enregistrement...' : 'Valider et enregistrer'}
                </button>
                <button
                  onClick={() => {
                    void handleApplyReviewDraft();
                  }}
                  disabled={applyingReviewDraft || reviewQueue.length > 0}
                  className={cn(
                    'py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70',
                    applyingReviewDraft || reviewQueue.length > 0
                      ? 'app-surface-2 app-muted cursor-not-allowed'
                      : 'app-accent-bg',
                  )}
                >
                  {applyingReviewDraft ? 'Application...' : 'Valider et appliquer au formulaire'}
                </button>
                <button
                  onClick={handleLoadNextReviewDraft}
                  disabled={reviewQueue.length === 0}
                  className={cn(
                    'py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70',
                    reviewQueue.length === 0 ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-warning-bg',
                  )}
                >
                  Brouillon suivant
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl app-card p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={startNewRecipe}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[13px] font-semibold transition-opacity active:opacity-70 whitespace-nowrap',
                  !selectedRecipeId ? 'app-accent-bg' : 'app-surface-2 app-muted',
                )}
              >
                + Nouvelle fiche
              </button>
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => {
                    openRecipe(recipe).catch(() => showError('Impossible de charger la fiche'));
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[13px] font-semibold transition-opacity active:opacity-70 whitespace-nowrap',
                    selectedRecipeId === recipe.id ? 'app-accent-bg' : 'app-surface-2 app-muted',
                  )}
                >
                  {recipe.title}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl app-card overflow-hidden">
            <div className="ios-settings-row flex-col items-stretch gap-1.5">
              <label className="text-[16px] font-semibold app-text">Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Burger maison"
                className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
              />
            </div>
            <div className="ios-settings-separator" />
            <div className="ios-settings-row grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[14px] app-muted">Portions</label>
                <input
                  type="number"
                  min="1"
                  value={portions}
                  onChange={(e) => setPortions(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[14px] app-muted">Prix vente HT</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePriceHT}
                  onChange={(e) => setSalePriceHT(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl app-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold app-text">Ingredients de la recette</h2>
              <button onClick={addRecipeLine} className="px-3 py-1.5 rounded-lg app-accent-bg text-[13px] font-semibold">
                Ajouter
              </button>
            </div>
            {lines.length === 0 && <p className="text-[14px] app-muted">Aucun ingredient pour le moment.</p>}
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="p-3 rounded-xl app-surface-2 space-y-2">
                  <select
                    value={line.ingredientId}
                    onChange={(e) => {
                      const ingredientId = e.target.value;
                      const ingredient = ingredientMap.get(ingredientId);
                      updateRecipeLine(line.id, {
                        ingredientId,
                        requiredUnit: ingredient?.unit || line.requiredUnit,
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-lg app-bg app-text border-0 focus:outline-none"
                  >
                    {ingredients.length === 0 && <option value="">Aucun ingredient</option>}
                    {ingredients.map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name} ({money(ingredient.unitPrice)}/{ingredient.unit})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.requiredQuantity}
                      onChange={(e) =>
                        updateRecipeLine(line.id, {
                          requiredQuantity: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="Quantite"
                      className="px-3 py-2.5 rounded-lg app-bg app-text border-0 focus:outline-none"
                    />
                    <select
                      value={line.requiredUnit}
                      onChange={(e) => updateRecipeLine(line.id, { requiredUnit: e.target.value as RecipeUnit })}
                      className="px-3 py-2.5 rounded-lg app-bg app-text border-0 focus:outline-none"
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => removeRecipeLine(line.id)}
                    className="text-[13px] font-semibold text-[color:var(--app-danger)] active:opacity-70"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={cn('rounded-2xl border p-4 space-y-2 sticky bottom-20', summaryTone)}>
            <div className="flex justify-between text-[14px]">
              <span className="app-muted">Cout total recette</span>
              <span className="font-semibold app-text">{money(liveSummary.totalCost)}</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="app-muted">Cout / portion</span>
              <span className="font-semibold app-text">{money(liveSummary.totalCost / parsedPortions)}</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="app-muted">Marge brute</span>
              <span className="font-semibold app-text">{money(liveSummary.grossMargin)}</span>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="font-semibold app-text">Food cost</span>
              <span className="font-bold app-text">{(liveSummary.foodCostRate * 100).toFixed(1)}%</span>
            </div>
            {liveSummary.foodCostRate > 0.3 && (
              <p className="text-[13px] font-semibold text-[color:var(--app-danger)]">
                Alerte: le food cost depasse 30% du prix de vente.
              </p>
            )}
            {selectedRecipeId && (
              <p className="text-[12px] app-muted">
                Dernier calcul en base: {(lastSavedSummary.foodCostRate * 100).toFixed(1)}%
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveRecipe}
              className="flex-1 py-3 rounded-xl app-accent-bg text-[16px] font-semibold active:opacity-70"
            >
              Enregistrer la fiche
            </button>
            {selectedRecipeId && (
              <button
                onClick={handleDeleteRecipe}
                className="px-4 py-3 rounded-xl app-danger-bg text-[15px] font-semibold active:opacity-70"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      {mode === 'ingredients' && (
        <div className="space-y-4 pb-24">
          <div className="rounded-2xl app-card overflow-hidden">
            <div className="ios-settings-row flex-col items-stretch gap-1.5">
              <label className="text-[16px] font-semibold app-text">Nom ingredient</label>
              <input
                type="text"
                value={ingredientName}
                onChange={(e) => setIngredientName(e.target.value)}
                placeholder="Ex: Farine T55"
                className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none"
              />
            </div>
            <div className="ios-settings-separator" />
            <div className="ios-settings-row grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[14px] app-muted">Unite de prix</label>
                <select
                  value={ingredientUnit}
                  onChange={(e) => setIngredientUnit(e.target.value as IngredientUnit)}
                  className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text border-0 focus:outline-none"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[14px] app-muted">Prix unitaire</label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={ingredientUnitPrice}
                  onChange={(e) => setIngredientUnitPrice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl app-surface-2 app-text border-0 focus:outline-none"
                />
              </div>
            </div>
            <div className="ios-settings-separator" />
            <div className="ios-settings-row flex-col items-stretch gap-1.5">
              <label className="text-[14px] app-muted">Fournisseur (optionnel)</label>
              <input
                type="text"
                value={ingredientSupplier}
                onChange={(e) => setIngredientSupplier(e.target.value)}
                placeholder="Ex: Metro"
                className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[16px] border-0 focus:outline-none"
              />
              {supplierQuickPicks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {supplierQuickPicks.map((supplier) => (
                    <button
                      key={`supplier-pick-ingredient-${supplier}`}
                      type="button"
                      onClick={() => setIngredientSupplier(canonicalizeSupplierName(supplier))}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[12px] font-semibold active:opacity-70',
                        ingredientSupplier.trim().toLowerCase() === supplier.toLowerCase()
                          ? 'app-accent-bg'
                          : 'app-surface-2 app-text',
                      )}
                    >
                      {supplier}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 flex gap-2">
              <button
                onClick={handleSaveIngredient}
                className="flex-1 py-3 rounded-xl app-accent-bg text-[16px] font-semibold active:opacity-70"
              >
                {editingIngredientId ? "Mettre a jour l'ingredient" : "Ajouter l'ingredient"}
              </button>
              {editingIngredientId && (
                <button
                  onClick={resetIngredientForm}
                  className="px-4 py-3 rounded-xl app-surface-2 app-text text-[14px] font-semibold active:opacity-70"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {ingredients.map((ingredient) => (
              <div key={ingredient.id} className="rounded-xl app-card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold app-text truncate">{ingredient.name}</p>
                  <p className="text-[13px] app-muted">
                    {money(ingredient.unitPrice)}/{ingredient.unit}
                    {ingredient.supplierId ? ` - ${ingredient.supplierId}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleEditIngredient(ingredient)}
                  className="px-3 py-1.5 rounded-lg app-surface-2 app-text text-[12px] font-semibold active:opacity-70"
                >
                  Editer
                </button>
                <button
                  onClick={() => {
                    void handleDeleteIngredient(ingredient.id);
                  }}
                  className="px-3 py-1.5 rounded-lg app-danger-bg text-[12px] font-semibold active:opacity-70"
                >
                  Suppr.
                </button>
              </div>
            ))}
            {ingredients.length === 0 && (
              <div className="rounded-xl app-card p-4 text-center text-[14px] app-muted">
                Aucun ingredient configure.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


