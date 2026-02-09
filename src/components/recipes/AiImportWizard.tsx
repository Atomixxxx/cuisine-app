import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Modal from '../common/Modal';
import CostSummaryBar from './CostSummaryBar';
import {
  type Ingredient,
  type PriceHistory,
  type Recipe,
  type RecipeCostSummary,
  type RecipeIngredient,
  type RecipeUnit,
} from '../../types';
import { cn } from '../../utils';
import { useAppStore } from '../../stores/appStore';
import { showError, showSuccess } from '../../stores/toastStore';
import { generateRecipeTemplateFromLine } from '../../services/recipeAi';
import { getEffectiveUnitPrice } from '../../services/recipeCost';
import { upsertSupplierProductMapping } from '../../services/supplierMapping';
import { buildSupplierQuickPicks, canonicalizeSupplierName } from '../../services/suppliers';
import { nameSimilarity } from '../../services/ingredientMatch';

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
  source: 'ai' | 'mapping';
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

interface AiImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  ingredients: Ingredient[];
  priceHistory: PriceHistory[];
  recipes: Recipe[];
  onRecipeCreated: (recipeId: string) => void;
}

export default function AiImportWizard({
  isOpen,
  onClose,
  ingredients,
  priceHistory,
  recipes,
  onRecipeCreated,
}: AiImportWizardProps) {
  const addIngredient = useAppStore((s) => s.addIngredient);
  const updateIngredient = useAppStore((s) => s.updateIngredient);
  const saveRecipeWithIngredients = useAppStore((s) => s.saveRecipeWithIngredients);

  // Step state
  const [step, setStep] = useState<'input' | 'review'>('input');

  // Input state
  const [supplierLabel, setSupplierLabel] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [ratioInput, setRatioInput] = useState('1');
  const [showBatch, setShowBatch] = useState(false);
  const [batchInput, setBatchInput] = useState('');
  const [batchRows, setBatchRows] = useState<BatchImportRow[]>([]);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Review state
  const [reviewDraft, setReviewDraft] = useState<RecipeReviewDraft | null>(null);
  const [reviewQueue, setReviewQueue] = useState<RecipeReviewDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const supplierQuickPicks = useMemo(() => {
    const names = [
      ...ingredients.map((i) => i.supplierId || ''),
      ...priceHistory.map((e) => e.supplier || ''),
    ].map((v) => v.trim()).filter(Boolean);
    return buildSupplierQuickPicks(names);
  }, [ingredients, priceHistory]);

  const aiCatalog = useMemo(
    () => ingredients.filter((i) => i.unitPrice > 0).map((i) => ({ name: i.name, unit: i.unit, unitPrice: getEffectiveUnitPrice(i), supplierId: i.supplierId })),
    [ingredients],
  );

  // --- Helpers ---
  const sim = nameSimilarity;

  const findBestIngredient = (name: string) => {
    let best: Ingredient | null = null;
    let bestScore = 0;
    for (const ing of ingredients) {
      const s = sim(name, ing.name);
      if (s > bestScore) { bestScore = s; best = ing; }
    }
    return { ingredient: bestScore >= 0.78 ? best : null, score: bestScore };
  };

  const findBestCadencier = (name: string) => {
    let best: PriceHistory | null = null;
    let bestScore = 0;
    for (const e of priceHistory) {
      const s = sim(name, e.itemName);
      if (s > bestScore) { bestScore = s; best = e; }
    }
    return { entry: bestScore >= 0.72 ? best : null, score: bestScore };
  };

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const convertQuantity = (value: number, from: RecipeUnit, to: RecipeUnit): number | null => {
    if (from === to) return value;
    if (from === 'g' && to === 'kg') return value / 1000;
    if (from === 'kg' && to === 'g') return value * 1000;
    if (from === 'ml' && to === 'l') return value / 1000;
    if (from === 'l' && to === 'ml') return value * 1000;
    return null;
  };

  // --- Build AI draft ---
  const buildAiDraft = async (label: string, ratio: number, meta?: { supplierId?: string; supplierSku?: string }): Promise<RecipeReviewDraft | null> => {
    const generated = await generateRecipeTemplateFromLine(label, {
      salePriceHT: undefined,
      targetFoodCostRate: 0.3,
      qualityGoal: 'premium',
      catalog: aiCatalog,
    });
    if (!generated.ingredients.length) return null;

    const lines: RecipeReviewLine[] = [];
    let matchedCount = 0;
    let cadencierCount = 0;
    let noPriceCount = 0;
    let newCount = 0;

    for (const item of generated.ingredients) {
      const scaled = Math.round(item.quantity * ratio * 1000) / 1000;
      if (scaled <= 0) continue;

      const ingMatch = findBestIngredient(item.name);
      const ing = ingMatch.ingredient;
      const cadMatch = findBestCadencier(item.name);
      const cad = cadMatch.entry;

      let priceSource: ReviewPriceSource = 'none';
      let unitPrice = 0;
      if (ing?.unitPrice && ing.unitPrice > 0) { unitPrice = getEffectiveUnitPrice(ing); priceSource = 'ingredient'; matchedCount++; }
      else if (cad?.averagePrice && cad.averagePrice > 0) { unitPrice = cad.averagePrice; priceSource = 'cadencier'; cadencierCount++; }
      else noPriceCount++;

      if (!ing) newCount++;
      const confidence = ing ? clamp(0.65 + ingMatch.score * 0.35) : cad ? clamp(0.45 + cadMatch.score * 0.35) : 0.5;

      lines.push({
        id: crypto.randomUUID(), ingredientId: ing?.id || '', ingredientName: ing?.name || item.name,
        requiredQuantity: scaled, requiredUnit: ing?.unit || item.unit, unitPrice,
        supplierId: ing?.supplierId || cad?.supplier || '', priceSource, confidence,
      });
    }
    if (!lines.length) return null;

    const avgConf = lines.reduce((s, l) => s + l.confidence, 0) / lines.length;
    return {
      source: 'ai', title: generated.title || label,
      portions: Math.max(1, Math.round(generated.portions || 1)),
      salePriceHT: generated.salePriceHT > 0 ? generated.salePriceHT : 0,
      lines,
      feedback: `${matchedCount} relie(s), ${cadencierCount} cadencier, ${newCount} a creer, ${noPriceCount} sans prix.`,
      supplierLine: { label, supplierId: meta?.supplierId, supplierSku: meta?.supplierSku, quantityRatio: ratio, confidence: clamp(0.6 + avgConf * 0.4) },
    };
  };

  // --- Handlers ---
  const handleGenerate = async () => {
    const label = supplierLabel.trim();
    if (!label) { showError('Renseigne le produit'); return; }
    const ratio = Number.parseFloat(ratioInput);
    if (!Number.isFinite(ratio) || ratio <= 0) { showError('Ratio invalide'); return; }

    setGenerating(true);
    try {
      const draft = await buildAiDraft(label, ratio, { supplierId: supplierId.trim() || undefined, supplierSku: supplierSku.trim() || undefined });
      if (!draft) { showError('Aucune ligne generee'); return; }
      setReviewDraft(draft);
      setReviewQueue([]);
      setStep('review');
      showSuccess('Generation IA terminee');
    } catch { showError('Erreur generation IA'); } finally { setGenerating(false); }
  };

  const handleGenerateBatch = async () => {
    const ratio = Number.parseFloat(ratioInput);
    if (!Number.isFinite(ratio) || ratio <= 0) { showError('Ratio invalide'); return; }

    const rows: BatchImportRow[] = batchRows.length > 0 ? batchRows : batchInput.split('\n').map((l) => l.trim()).filter(Boolean).map((label) => ({ label }));
    if (!rows.length) { showError('Renseigne au moins une ligne'); return; }

    setBatchGenerating(true);
    try {
      const drafts: RecipeReviewDraft[] = [];
      for (const row of rows) {
        const r = Number.isFinite(row.ratio || NaN) && (row.ratio || 0) > 0 ? (row.ratio as number) : ratio;
        const d = await buildAiDraft(row.label, r, { supplierId: row.supplierId || supplierId.trim() || undefined, supplierSku: row.supplierSku || supplierSku.trim() || undefined });
        if (d) drafts.push(d);
      }
      if (!drafts.length) { showError('Aucun brouillon genere'); return; }
      setReviewDraft(drafts[0]);
      setReviewQueue(drafts.slice(1));
      setStep('review');
      showSuccess(`${drafts.length} brouillon(s) charge(s)`);
    } catch { showError('Erreur generation lot'); } finally { setBatchGenerating(false); }
  };

  // File import
  const parsePositiveNumber = (v: unknown): number | undefined => {
    const p = Number.parseFloat(String(v ?? '').replace(',', '.').trim());
    return Number.isFinite(p) && p > 0 ? p : undefined;
  };

  const normalizeHeader = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  const parseDelimitedLine = (line: string, delimiter: string): string[] => {
    const vals: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; continue; }
      if (!inQ && c === delimiter) { vals.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    vals.push(cur.trim());
    return vals.map((c) => c.replace(/^"|"$/g, '').trim());
  };

  const toBatchRow = (input: Record<string, unknown>): BatchImportRow | null => {
    const lbl = input.label ?? input.libelle ?? input.name ?? input.produit ?? input.item ?? input.designation;
    if (typeof lbl !== 'string' || !lbl.trim()) return null;
    const sup = input.supplierId ?? input.supplier ?? input.fournisseur;
    const sku = input.sku ?? input.supplierSku ?? input.reference ?? input.ref;
    const rat = input.ratio ?? input.quantityRatio ?? input.qteRatio ?? input.coefficient;
    return { label: lbl.trim(), supplierId: typeof sup === 'string' && sup.trim() ? sup.trim() : undefined, supplierSku: typeof sku === 'string' && sku.trim() ? sku.trim() : undefined, ratio: parsePositiveNumber(rat) };
  };

  const parseFile = (fileName: string, content: string): BatchImportRow[] => {
    if (fileName.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e): BatchImportRow | null => typeof e === 'string' ? { label: e.trim() } : e && typeof e === 'object' ? toBatchRow(e as Record<string, unknown>) : null).filter((r): r is BatchImportRow => Boolean(r?.label));
    }
    const rawLines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!rawLines.length) return [];
    const delim = rawLines.some((l) => l.includes(';')) ? ';' : rawLines.some((l) => l.includes('\t')) ? '\t' : ',';
    const hCells = parseDelimitedLine(rawLines[0], delim).map(normalizeHeader);
    const idx = (aliases: string[]) => hCells.findIndex((c) => aliases.includes(c));
    const li = idx(['label', 'libelle', 'produit', 'item', 'designation', 'nom']);
    const si = idx(['supplier', 'supplierid', 'fournisseur', 'provider']);
    const ski = idx(['sku', 'suppliersku', 'reference', 'ref']);
    const ri = idx(['ratio', 'quantityratio', 'qteratio', 'coefficient']);
    const hasH = li >= 0 || si >= 0 || ski >= 0 || ri >= 0;
    const data = hasH ? rawLines.slice(1) : rawLines;
    return data.map((line): BatchImportRow | null => {
      const cells = parseDelimitedLine(line, delim);
      const label = (li >= 0 ? cells[li] || '' : cells[0] || '').trim();
      if (!label) return null;
      return { label, supplierId: si >= 0 ? (cells[si] || '').trim() || undefined : undefined, supplierSku: ski >= 0 ? (cells[ski] || '').trim() || undefined : undefined, ratio: ri >= 0 ? parsePositiveNumber(cells[ri]) : undefined };
    }).filter((r): r is BatchImportRow => Boolean(r?.label));
  };

  const handleFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const rows = parseFile(file.name, content);
      if (!rows.length) { showError('Aucune ligne exploitable'); return; }
      setBatchRows(rows);
      setBatchInput(rows.map((r) => r.label).join('\n'));
      showSuccess(`${rows.length} ligne(s) importee(s)`);
    } catch { showError('Impossible de lire le fichier'); } finally { e.target.value = ''; }
  };

  const handleJsonPaste = () => {
    const text = batchInput.trim();
    if (!text.startsWith('[') && !text.startsWith('{')) { showError('Pas du JSON'); return; }
    try {
      const parsed = JSON.parse(text);
      const rows = (Array.isArray(parsed) ? parsed : [parsed])
        .map((e): BatchImportRow | null => typeof e === 'string' ? { label: e.trim() } : e && typeof e === 'object' ? toBatchRow(e as Record<string, unknown>) : null)
        .filter((r): r is BatchImportRow => Boolean(r?.label));
      if (!rows.length) { showError('Aucun label exploitable'); return; }
      setBatchRows(rows);
      setBatchInput(rows.map((r) => r.label).join('\n'));
      showSuccess(`${rows.length} ligne(s) parsee(s)`);
    } catch { showError('JSON invalide'); }
  };

  // --- Review helpers ---
  const updateReviewLine = (lineId: string, patch: Partial<RecipeReviewLine>) => {
    setReviewDraft((prev) => prev ? { ...prev, lines: prev.lines.map((l) => l.id === lineId ? { ...l, ...patch } : l) } : prev);
  };

  const removeReviewLine = (lineId: string) => {
    setReviewDraft((prev) => prev ? { ...prev, lines: prev.lines.filter((l) => l.id !== lineId) } : prev);
  };

  const reviewSummary = useMemo((): RecipeCostSummary | null => {
    if (!reviewDraft) return null;
    const totalCost = reviewDraft.lines.reduce((sum, line) => {
      const linked = line.ingredientId ? ingredientMap.get(line.ingredientId) : undefined;
      const priceUnit = linked?.unit || line.requiredUnit;
      const conv = convertQuantity(line.requiredQuantity, line.requiredUnit, priceUnit);
      if (conv === null || conv < 0 || !Number.isFinite(conv)) return sum;
      const price = linked && linked.unitPrice > 0 ? getEffectiveUnitPrice(linked) : line.unitPrice;
      return sum + conv * Math.max(0, price || 0);
    }, 0);
    const sp = Number.isFinite(reviewDraft.salePriceHT) && reviewDraft.salePriceHT > 0 ? reviewDraft.salePriceHT : 0;
    const rate = sp > 0 ? totalCost / sp : 0;
    return { totalCost, grossMargin: sp - totalCost, foodCostRate: rate, warningLevel: rate > 0.3 ? 'danger' : rate > 0.25 ? 'warning' : 'ok' };
  }, [reviewDraft, ingredientMap]);

  // --- Save review ---
  const materializeLines = async (sourceLines: RecipeReviewLine[]) => {
    const nextIngredients = [...ingredients];
    const nextLines: { id: string; ingredientId: string; requiredQuantity: number; requiredUnit: RecipeUnit }[] = [];

    for (const line of sourceLines) {
      const linked = line.ingredientId ? nextIngredients.find((e) => e.id === line.ingredientId) : undefined;
      if (linked) {
        if (linked.unitPrice <= 0 && line.unitPrice > 0) {
          const patched = { ...linked, unitPrice: line.unitPrice, supplierId: linked.supplierId || line.supplierId || undefined };
          await updateIngredient(patched);
          const idx = nextIngredients.findIndex((e) => e.id === linked.id);
          if (idx >= 0) nextIngredients[idx] = patched;
        }
        nextLines.push({ id: crypto.randomUUID(), ingredientId: linked.id, requiredQuantity: line.requiredQuantity, requiredUnit: line.requiredUnit });
        continue;
      }
      const name = line.ingredientName.trim();
      if (!name) throw new Error('missing_ingredient_name');
      const created: Ingredient = { id: crypto.randomUUID(), name, unit: line.requiredUnit, unitPrice: Math.max(0, line.unitPrice || 0), supplierId: line.supplierId.trim() || undefined };
      await addIngredient(created);
      nextIngredients.push(created);
      nextLines.push({ id: crypto.randomUUID(), ingredientId: created.id, requiredQuantity: line.requiredQuantity, requiredUnit: line.requiredUnit });
    }
    return nextLines;
  };

  const handleSaveReview = async () => {
    if (!reviewDraft) return;
    const trimmedTitle = reviewDraft.title.trim();
    if (!trimmedTitle) { showError('Titre obligatoire'); return; }
    if (!Number.isFinite(reviewDraft.salePriceHT) || reviewDraft.salePriceHT <= 0) { showError('Prix de vente HT obligatoire'); return; }
    const filtered = reviewDraft.lines.filter((l) => l.requiredQuantity > 0);
    if (!filtered.length) { showError('Ajoute au moins un ingredient'); return; }

    setSaving(true);
    try {
      const nextLines = await materializeLines(filtered);
      const now = new Date();
      const recipeId = crypto.randomUUID();
      const recipe: Recipe = { id: recipeId, title: trimmedTitle, portions: Math.max(1, Math.round(reviewDraft.portions || 1)), salePriceHT: Math.max(0, reviewDraft.salePriceHT || 0), createdAt: now, updatedAt: now, allergens: [] };
      const linked: RecipeIngredient[] = nextLines.map((l) => ({ ...l, recipeId }));
      await saveRecipeWithIngredients(recipe, linked);

      if (reviewDraft.supplierLine) {
        await upsertSupplierProductMapping({ supplierId: reviewDraft.supplierLine.supplierId, supplierSku: reviewDraft.supplierLine.supplierSku, label: reviewDraft.supplierLine.label, templateRecipeId: recipeId, quantityRatio: reviewDraft.supplierLine.quantityRatio, confidence: reviewDraft.supplierLine.confidence });
      }

      if (reviewQueue.length > 0) {
        const [next, ...rest] = reviewQueue;
        setReviewQueue(rest);
        setReviewDraft(next);
        showSuccess(`Fiche enregistree. ${rest.length + 1} restant(s).`);
      } else {
        showSuccess('Fiche technique enregistree');
        onRecipeCreated(recipeId);
        resetAndClose();
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'missing_ingredient_name') showError('Un ingredient sans nom');
      else showError("Impossible d'enregistrer");
    } finally { setSaving(false); }
  };

  const resetAndClose = () => {
    setStep('input');
    setSupplierLabel('');
    setSupplierId('');
    setSupplierSku('');
    setSelectedTemplateId('');
    setRatioInput('1');
    setShowBatch(false);
    setBatchInput('');
    setBatchRows([]);
    setShowAdvanced(false);
    setReviewDraft(null);
    setReviewQueue([]);
    onClose();
  };

  const totalInQueue = reviewQueue.length + 1;
  const currentInQueue = totalInQueue - reviewQueue.length;

  const scoreLabel = (s: number) => s >= 0.9 ? 'Haute' : s >= 0.75 ? 'Moyenne' : 'Basse';

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title={step === 'input' ? 'Import IA' : `Validation${reviewQueue.length > 0 ? ` (${currentInQueue}/${totalInQueue})` : ''}`} size="xl">
      {step === 'input' && (
        <div className="space-y-4">
          {/* Main input */}
          <div className="space-y-2">
            <label className="text-[14px] font-semibold app-text">Produit ou ligne fournisseur</label>
            <input
              type="text"
              value={supplierLabel}
              onChange={(e) => setSupplierLabel(e.target.value)}
              placeholder='Ex: "Pate Burger Brioche 4x100g"'
              className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
              autoFocus
            />
          </div>

          {/* Advanced options (collapsed) */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[13px] app-muted active:opacity-70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-90')} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Options avancees
          </button>

          {showAdvanced && (
            <div className="space-y-2 rounded-xl app-surface-2 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Fournisseur" className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none" />
                <input type="text" value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} placeholder="SKU" className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none" />
              </div>
              {supplierQuickPicks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {supplierQuickPicks.map((s) => (
                    <button key={s} type="button" onClick={() => setSupplierId(canonicalizeSupplierName(s))}
                      className={cn('px-2.5 py-1 rounded-full text-[12px] font-semibold active:opacity-70', supplierId.trim().toLowerCase() === s.toLowerCase() ? 'app-accent-bg' : 'app-surface-2 app-text')}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr,100px] gap-2">
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none">
                  <option value="">Template (optionnel)</option>
                  {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
                <input type="number" min="0.0001" step="0.01" value={ratioInput} onChange={(e) => setRatioInput(e.target.value)} placeholder="Ratio" className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none" />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => { void handleGenerate(); }}
              disabled={generating}
              className={cn('flex-1 py-3 rounded-xl text-[15px] font-semibold active:opacity-70', generating ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg')}
            >
              {generating ? 'Generation...' : 'Generer avec IA'}
            </button>
            <button
              onClick={() => setShowBatch(!showBatch)}
              className="px-4 py-3 rounded-xl app-surface-2 app-text text-[14px] font-semibold active:opacity-70"
            >
              {showBatch ? 'Masquer lot' : 'Importer lot'}
            </button>
          </div>

          {/* Batch section */}
          {showBatch && (
            <div className="space-y-2 rounded-xl app-surface-2 p-3">
              <textarea
                value={batchInput}
                onChange={(e) => { setBatchInput(e.target.value); setBatchRows([]); }}
                rows={4}
                placeholder="1 produit par ligne ou JSON"
                className="w-full px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none resize-y"
              />
              <div className="flex gap-2">
                <input ref={batchFileRef} type="file" accept=".csv,.txt,.json" onChange={(e) => { void handleFileImport(e); }} className="hidden" />
                <button onClick={() => batchFileRef.current?.click()} className="px-3 py-2 rounded-lg app-surface-3 app-text text-[13px] font-semibold active:opacity-70">Importer fichier</button>
                <button onClick={handleJsonPaste} className="px-3 py-2 rounded-lg app-surface-3 app-text text-[13px] font-semibold active:opacity-70">Parser JSON</button>
              </div>
              <button
                onClick={() => { void handleGenerateBatch(); }}
                disabled={batchGenerating}
                className={cn('w-full py-3 rounded-xl text-[14px] font-semibold active:opacity-70', batchGenerating ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg')}
              >
                {batchGenerating ? 'Generation lot...' : 'Generer le lot IA'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'review' && reviewDraft && (
        <div className="space-y-3">
          {/* Draft metadata */}
          <p className="text-[13px] app-muted">{reviewDraft.feedback}</p>

          {/* Title / portions / price */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" value={reviewDraft.title} onChange={(e) => setReviewDraft((p) => p ? { ...p, title: e.target.value } : p)} placeholder="Titre" className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none" />
            <input type="number" min="1" value={reviewDraft.portions} onChange={(e) => setReviewDraft((p) => p ? { ...p, portions: Math.max(1, parseInt(e.target.value, 10) || 1) } : p)} placeholder="Portions" className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none" />
            <input type="number" min="0" step="0.01" value={reviewDraft.salePriceHT} onChange={(e) => setReviewDraft((p) => p ? { ...p, salePriceHT: Math.max(0, parseFloat(e.target.value) || 0) } : p)} placeholder="Prix HT" className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[14px] border-0 focus:outline-none" />
          </div>

          {/* Lines */}
          <div className="space-y-2">
            {reviewDraft.lines.map((line) => (
              <div key={line.id} className="rounded-xl app-surface-2 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input type="text" value={line.ingredientName} onChange={(e) => updateReviewLine(line.id, { ingredientName: e.target.value })} placeholder="Ingredient" className="flex-1 px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none" />
                  <select value={line.ingredientId} onChange={(e) => {
                    const id = e.target.value;
                    const ing = ingredientMap.get(id);
                    updateReviewLine(line.id, { ingredientId: id, ingredientName: ing?.name || line.ingredientName, requiredUnit: ing?.unit || line.requiredUnit, unitPrice: ing ? getEffectiveUnitPrice(ing) : line.unitPrice, confidence: ing ? 0.95 : line.confidence });
                  }} className="w-32 px-2 py-2 rounded-lg app-bg app-text text-[13px] border-0 focus:outline-none">
                    <option value="">Nouveau</option>
                    {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <button onClick={() => removeReviewLine(line.id)} className="text-[color:var(--app-danger)] active:opacity-70" aria-label="Retirer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min="0" step="0.001" value={line.requiredQuantity} onChange={(e) => updateReviewLine(line.id, { requiredQuantity: Math.max(0, parseFloat(e.target.value) || 0) })} placeholder="Qte" className="px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none" />
                  <select value={line.requiredUnit} onChange={(e) => updateReviewLine(line.id, { requiredUnit: e.target.value as RecipeUnit })} className="px-2 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(e) => {
                    const p = Math.max(0, parseFloat(e.target.value) || 0);
                    updateReviewLine(line.id, { unitPrice: p, priceSource: p > 0 ? 'manual' : line.priceSource, confidence: p > 0 ? Math.max(line.confidence, 0.75) : line.confidence });
                  }} placeholder="Prix unit." className="px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none" />
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className={cn('font-semibold', line.confidence >= 0.9 ? 'text-[color:var(--app-success)]' : line.confidence >= 0.75 ? 'text-[color:var(--app-warning)]' : 'text-[color:var(--app-danger)]')}>
                    {scoreLabel(line.confidence)} ({Math.round(line.confidence * 100)}%)
                  </span>
                  <span className={cn('font-medium', line.priceSource === 'none' ? 'text-[color:var(--app-danger)]' : 'app-muted')}>
                    {line.priceSource === 'ingredient' && 'Prix ingredient'}
                    {line.priceSource === 'cadencier' && 'Prix cadencier'}
                    {line.priceSource === 'manual' && 'Saisi'}
                    {line.priceSource === 'none' && 'Prix manquant'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Cost summary */}
          {reviewSummary && <CostSummaryBar summary={reviewSummary} portions={reviewDraft.portions} sticky={false} />}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setStep('input'); setReviewDraft(null); setReviewQueue([]); }}
              className="px-4 py-3 rounded-xl app-surface-2 app-text text-[14px] font-semibold active:opacity-70"
            >
              Annuler
            </button>
            <button
              onClick={() => { void handleSaveReview(); }}
              disabled={saving}
              className={cn('flex-1 py-3 rounded-xl text-[15px] font-semibold active:opacity-70', saving ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-success-bg')}
            >
              {saving ? 'Enregistrement...' : 'Valider et enregistrer'}
            </button>
            {reviewQueue.length > 0 && (
              <button
                onClick={() => { const [next, ...rest] = reviewQueue; setReviewQueue(rest); setReviewDraft(next); }}
                className="px-4 py-3 rounded-xl app-warning-bg text-[14px] font-semibold active:opacity-70"
              >
                Suivant
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
