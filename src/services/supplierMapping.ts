import { db } from './db';
import type { SupplierLineInput, SupplierLineResolution, SupplierProductMapping } from '../types';

interface UpsertMappingInput {
  supplierId?: string;
  supplierSku?: string;
  label: string;
  templateRecipeId: string;
  quantityRatio: number;
  confidence: number;
}

const GLOBAL_SUPPLIER_KEY = '__any__';

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSupplierLabel(value: string): string {
  return stripAccents(value.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokenSet(value: string): Set<string> {
  return new Set(normalizeSupplierLabel(value).split(' ').filter(Boolean));
}

function jaccardScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function bigramSet(input: string): Set<string> {
  const clean = normalizeSupplierLabel(input).replace(/\s/g, '');
  if (clean.length < 2) return new Set([clean]);
  const values = new Set<string>();
  for (let i = 0; i < clean.length - 1; i += 1) {
    values.add(clean.slice(i, i + 2));
  }
  return values;
}

function diceScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return (2 * intersection) / (left.size + right.size);
}

function similarityScore(source: string, target: string): number {
  const sourceTokens = toTokenSet(source);
  const targetTokens = toTokenSet(target);
  const tokenScore = jaccardScore(sourceTokens, targetTokens);
  const charScore = diceScore(bigramSet(source), bigramSet(target));
  const normalizedSource = normalizeSupplierLabel(source);
  const normalizedTarget = normalizeSupplierLabel(target);
  const containsBonus =
    normalizedSource && normalizedTarget && normalizedSource.includes(normalizedTarget) ? 0.1 : 0;

  return Math.min(1, tokenScore * 0.6 + charScore * 0.4 + containsBonus);
}

export async function resolveSupplierLine(line: SupplierLineInput): Promise<SupplierLineResolution | null> {
  const supplierId = line.supplierId?.trim() || GLOBAL_SUPPLIER_KEY;
  const normalizedLabel = normalizeSupplierLabel(line.label);
  const sku = line.supplierSku?.trim();

  if (!normalizedLabel && !sku) return null;

  if (sku) {
    const exactBySku = await db.supplierProductMappings
      .where('[supplierId+supplierSku]')
      .equals([supplierId, sku])
      .first();
    const exactBySkuGlobal =
      supplierId === GLOBAL_SUPPLIER_KEY
        ? undefined
        : await db.supplierProductMappings.where('[supplierId+supplierSku]').equals([GLOBAL_SUPPLIER_KEY, sku]).first();
    const skuMatch = exactBySku || exactBySkuGlobal;
    if (skuMatch) {
      return {
        templateRecipeId: skuMatch.templateRecipeId,
        quantityRatio: skuMatch.quantityRatio,
        confidence: skuMatch.confidence,
        source: 'exact',
      };
    }
  }

  const exactByLabel = await db.supplierProductMappings
    .where('[supplierId+supplierLabelNormalized]')
    .equals([supplierId, normalizedLabel])
    .first();
  const exactByLabelGlobal =
    supplierId === GLOBAL_SUPPLIER_KEY
      ? undefined
      : await db.supplierProductMappings
          .where('[supplierId+supplierLabelNormalized]')
          .equals([GLOBAL_SUPPLIER_KEY, normalizedLabel])
          .first();
  const labelMatch = exactByLabel || exactByLabelGlobal;
  if (labelMatch) {
    return {
      templateRecipeId: labelMatch.templateRecipeId,
      quantityRatio: labelMatch.quantityRatio,
      confidence: labelMatch.confidence,
      source: 'exact',
    };
  }

  const templates = await db.recipes.toArray();
  if (templates.length === 0) return null;

  let bestRecipeId: string | null = null;
  let bestScore = 0;
  for (const template of templates) {
    const score = similarityScore(normalizedLabel, template.title);
    if (score > bestScore) {
      bestScore = score;
      bestRecipeId = template.id;
    }
  }

  if (!bestRecipeId || bestScore < 0.8) return null;
  return {
    templateRecipeId: bestRecipeId,
    quantityRatio: 1,
    confidence: Math.max(0.7, Math.min(1, bestScore)),
    source: 'fuzzy',
  };
}

export async function upsertSupplierProductMapping(input: UpsertMappingInput): Promise<void> {
  const supplierId = input.supplierId?.trim() || GLOBAL_SUPPLIER_KEY;
  const supplierSku = input.supplierSku?.trim() || undefined;
  const supplierLabelNormalized = normalizeSupplierLabel(input.label);
  const quantityRatio = Number.isFinite(input.quantityRatio) ? Math.max(0.0001, input.quantityRatio) : 1;
  const confidence = Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0.7;

  if (!supplierLabelNormalized) return;

  let existing: SupplierProductMapping | undefined;
  if (supplierSku) {
    existing = await db.supplierProductMappings.where('[supplierId+supplierSku]').equals([supplierId, supplierSku]).first();
  }
  if (!existing) {
    existing = await db.supplierProductMappings
      .where('[supplierId+supplierLabelNormalized]')
      .equals([supplierId, supplierLabelNormalized])
      .first();
  }

  const payload: SupplierProductMapping = {
    id: existing?.id || crypto.randomUUID(),
    supplierId,
    supplierSku,
    supplierLabelNormalized,
    templateRecipeId: input.templateRecipeId,
    quantityRatio,
    confidence,
  };

  await db.supplierProductMappings.put(payload);
}
