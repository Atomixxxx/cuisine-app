import type { Ingredient, IngredientUnit } from '../types';

/** Normalize a product/ingredient name for fuzzy matching */
export function normalizeName(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard similarity between two names (0..1) */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const at = new Set(na.split(' '));
  const bt = new Set(nb.split(' '));
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter++;
  const union = at.size + bt.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Find the best matching ingredient for a given name */
export function findBestIngredientMatch(
  name: string,
  ingredients: Ingredient[],
  threshold = 0.78,
): { ingredient: Ingredient; score: number } | null {
  let best: Ingredient | null = null;
  let bestScore = 0;
  for (const ing of ingredients) {
    const s = nameSimilarity(name, ing.name);
    if (s > bestScore) {
      bestScore = s;
      best = ing;
    }
  }
  if (best && bestScore >= threshold) return { ingredient: best, score: bestScore };
  return null;
}

/** Infer the unit from a conditioning unit string */
export function inferUnit(condUnit: string | undefined): IngredientUnit {
  if (!condUnit) return 'unite';
  const u = condUnit.toLowerCase().trim();
  if (u === 'kg' || u === 'g' || u === 'l' || u === 'ml' || u === 'unite') return u;
  return 'unite';
}
