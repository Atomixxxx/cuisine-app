import type { Ingredient } from '../types';
import { getApiKey } from './ocr';
import { sanitize } from '../utils';
import { db } from './db';

/**
 * Heuristic thresholds: if an ingredient's unitPrice exceeds these
 * for its unit type, the price is probably a bulk/conditioning price.
 */
const PRICE_THRESHOLDS: Record<string, number> = {
  unite: 2,     // > 2€/piece → probably a carton price (eggs, etc.)
  g: 0.5,       // > 0.50€/g → way too high, probably price per bag
  kg: 50,       // > 50€/kg → probably price per sac/carton
  ml: 0.1,      // > 0.10€/ml → probably price per bottle
  l: 30,        // > 30€/l → probably price per bidon
};

/** Check if an ingredient's price looks abnormally high (likely a bulk price) */
export function isPriceSuspicious(ingredient: Ingredient): boolean {
  if (ingredient.conditioningQuantity && ingredient.conditioningQuantity > 1) return false;
  if (ingredient.unitPrice <= 0) return false;
  const threshold = PRICE_THRESHOLDS[ingredient.unit] ?? 50;
  return ingredient.unitPrice > threshold;
}

/** Find all ingredients with suspicious prices (no conditioning set, price too high) */
export function findSuspiciousIngredients(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter(isPriceSuspicious);
}

interface ConditioningEstimate {
  name: string;
  estimatedConditioning: number;
  reasoning: string;
}

/**
 * Ask Gemini to estimate the likely conditioning for ingredients with suspicious prices.
 * Returns estimates that can be applied to update the ingredients.
 */
export async function estimateConditioning(
  ingredients: Array<{ name: string; unit: string; unitPrice: number }>,
): Promise<ConditioningEstimate[]> {
  if (ingredients.length === 0) return [];

  const apiKey = await getApiKey();
  if (!apiKey) return [];

  const list = ingredients
    .map((i) => `- ${i.name}: ${i.unitPrice.toFixed(2)} EUR/${i.unit}`)
    .join('\n');

  const prompt = `Tu es un expert en achat pour la restauration professionnelle en France.
Ces ingredients ont des prix qui semblent etre des prix par conditionnement (carton, sac, bidon) et non par unite de base.
Pour chaque ingredient, estime le conditionnement le plus probable.

Ingredients:
${list}

Reponds UNIQUEMENT avec un JSON valide (pas de markdown):
{
  "estimates": [
    { "name": "Nom", "estimatedConditioning": 90, "reasoning": "carton de 90 oeufs" }
  ]
}

Regles:
- estimatedConditioning = nombre d'unites de base dans le conditionnement habituel pro
- Ex: "Oeufs" a 8.50 EUR/unite → conditionnement 90 (carton 90 oeufs), prix reel 0.094 EUR/oeuf
- Ex: "Farine" a 35 EUR/kg → conditionnement 25 (sac 25kg), prix reel 1.40 EUR/kg
- Ex: "Sucre" a 25 EUR/kg → conditionnement 25 (sac 25kg), prix reel 1.00 EUR/kg
- Ex: "Huile" a 25 EUR/l → conditionnement 5 (bidon 5L), prix reel 5.00 EUR/l
- Si le prix semble normal (pas de conditionnement), mets estimatedConditioning: 1
- Base-toi sur les prix pro habituels (Metro, Transgourmet, Pomona, Gineys)`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      },
    );

    if (!response.ok) return [];
    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) return [];

    const cleaned = textContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as Record<string, unknown>;

    const estimates = Array.isArray(parsed.estimates)
      ? (parsed.estimates as Record<string, unknown>[])
      : [];

    return estimates
      .map((e) => ({
        name: sanitize(String(e.name || '')),
        estimatedConditioning: Math.max(1, Math.round(Number(e.estimatedConditioning) || 1)),
        reasoning: sanitize(String(e.reasoning || '')),
      }))
      .filter((e) => e.name && e.estimatedConditioning > 1);
  } catch {
    return [];
  }
}

/**
 * Auto-fix ingredients with suspicious prices by estimating their conditioning.
 * Updates the ingredients in the database directly.
 * Returns the number of ingredients fixed.
 */
export async function autoFixSuspiciousPrices(ingredients: Ingredient[]): Promise<number> {
  const suspicious = findSuspiciousIngredients(ingredients);
  if (suspicious.length === 0) return 0;

  const estimates = await estimateConditioning(
    suspicious.map((i) => ({ name: i.name, unit: i.unit, unitPrice: i.unitPrice })),
  );

  let fixed = 0;
  for (const est of estimates) {
    const ing = suspicious.find(
      (i) => i.name.toLowerCase().trim() === est.name.toLowerCase().trim(),
    );
    if (ing && est.estimatedConditioning > 1) {
      await db.ingredients.update(ing.id, {
        conditioningQuantity: est.estimatedConditioning,
      });
      fixed++;
    }
  }

  return fixed;
}
