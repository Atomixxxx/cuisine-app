import type { RecipeUnit } from '../types';
import { sanitize } from '../utils';
import { getApiKey } from './ocr';

export interface GeneratedRecipeIngredient {
  name: string;
  quantity: number;
  unit: RecipeUnit;
}

export interface GeneratedRecipeTemplate {
  title: string;
  portions: number;
  salePriceHT: number;
  ingredients: GeneratedRecipeIngredient[];
}

export interface RecipeAiCatalogIngredient {
  name: string;
  unit: RecipeUnit;
  unitPrice: number;
  supplierId?: string;
}

export interface RecipeGenerationOptions {
  salePriceHT?: number;
  targetFoodCostRate?: number;
  qualityGoal?: 'premium' | 'equilibre' | 'eco';
  catalog?: RecipeAiCatalogIngredient[];
}

function normalizeUnit(value: string): RecipeUnit {
  const unit = value.toLowerCase().trim();
  if (unit === 'kg' || unit === 'g' || unit === 'l' || unit === 'ml' || unit === 'unite') return unit;
  if (unit === 'u' || unit === 'piece' || unit === 'pieces') return 'unite';
  return 'unite';
}

function fallbackTemplateFromLabel(label: string, options?: RecipeGenerationOptions): GeneratedRecipeTemplate {
  const lower = label.toLowerCase();

  if (lower.includes('burger')) {
    return {
      title: 'Pain burger maison',
      portions: 10,
      salePriceHT: Math.max(0, options?.salePriceHT || 0),
      ingredients: [
        { name: 'Farine', quantity: 1, unit: 'kg' },
        { name: 'Lait', quantity: 300, unit: 'ml' },
        { name: 'Beurre', quantity: 120, unit: 'g' },
        { name: 'Levure boulangere', quantity: 15, unit: 'g' },
        { name: 'Sucre', quantity: 40, unit: 'g' },
        { name: 'Sel', quantity: 18, unit: 'g' },
      ],
    };
  }

  return {
    title: sanitize(label.trim() || 'Recette a completer'),
    portions: 1,
    salePriceHT: Math.max(0, options?.salePriceHT || 0),
    ingredients: [{ name: sanitize(label.trim() || 'Ingredient principal'), quantity: 1, unit: 'unite' }],
  };
}

function buildRecipePrompt(label: string, options: RecipeGenerationOptions): string {
  const targetFoodCostRate = Math.min(0.45, Math.max(0.2, options.targetFoodCostRate ?? 0.3));
  const targetPercent = Math.round(targetFoodCostRate * 100);
  const qualityGoal = options.qualityGoal ?? 'premium';
  const qualityText =
    qualityGoal === 'eco'
      ? 'Recette economique mais propre et professionnelle.'
      : qualityGoal === 'equilibre'
        ? 'Recette equilibree entre cout, execution et qualite gustative.'
        : 'Recette signature haut niveau (gout, texture, finition) mais realiste en production.';

  const salePriceContext =
    Number.isFinite(options.salePriceHT) && (options.salePriceHT || 0) > 0
      ? `Prix de vente HT cible: ${options.salePriceHT?.toFixed(2)} EUR.`
      : 'Prix de vente HT inconnu: propose une valeur realiste.';

  const catalogPreview = (options.catalog || [])
    .filter((ingredient) => ingredient.unitPrice > 0)
    .sort((a, b) => a.unitPrice - b.unitPrice)
    .slice(0, 60)
    .map(
      (ingredient) =>
        `- ${ingredient.name} | ${ingredient.unitPrice.toFixed(4)} EUR/${ingredient.unit}${ingredient.supplierId ? ` | ${ingredient.supplierId}` : ''}`,
    )
    .join('\n');

  const catalogBlock = catalogPreview
    ? `Cadencier ingredient disponible (prioriser ces noms exacts si pertinents):
${catalogPreview}`
    : 'Cadencier ingredient non fourni.';

  return `Tu es un chef executif expert food cost.
Genere une fiche technique a partir de ce libelle produit: "${label}".

Objectifs:
- ${qualityText}
- Viser un food cost <= ${targetPercent}% quand c'est possible.
- ${salePriceContext}
- Favoriser les ingredients references dans le cadencier pour faciliter le pricing.

${catalogBlock}

Reponds UNIQUEMENT avec un JSON valide (pas de markdown):
{
  "title": "Nom de la recette",
  "portions": 1,
  "salePriceHT": 0,
  "ingredients": [
    { "name": "Nom ingredient", "quantity": 1, "unit": "kg|g|l|ml|unite" }
  ]
}

Regles:
- Recette executable en cuisine pro.
- portions entier >= 1.
- max 15 ingredients.
- ingredients realistes et pertinents.
- unit strictement parmi: kg,g,l,ml,unite`;
}

export async function generateRecipeTemplateFromLine(
  label: string,
  options: RecipeGenerationOptions = {},
): Promise<GeneratedRecipeTemplate> {
  const trimmed = label.trim();
  if (!trimmed) return fallbackTemplateFromLabel(label, options);

  const apiKey = await getApiKey();
  if (!apiKey) return fallbackTemplateFromLabel(trimmed, options);

  const prompt = buildRecipePrompt(trimmed, options);

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  };

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      return fallbackTemplateFromLabel(trimmed, options);
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
    if (!textContent) return fallbackTemplateFromLabel(trimmed, options);

    const jsonStr = textContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr) as Record<string, unknown>;

    const ingredientsRaw = Array.isArray(parsed.ingredients) ? (parsed.ingredients as Record<string, unknown>[]) : [];
    const ingredients: GeneratedRecipeIngredient[] = ingredientsRaw
      .map((line) => ({
        name: sanitize(String(line.name || '').trim()),
        quantity: Math.max(0, Number(line.quantity) || 0),
        unit: normalizeUnit(String(line.unit || 'unite')),
      }))
      .filter((line) => line.name.length > 0 && line.quantity > 0)
      .slice(0, 15);

    if (ingredients.length === 0) return fallbackTemplateFromLabel(trimmed, options);

    const parsedSalePrice = Math.max(0, Number(parsed.salePriceHT) || 0);
    const fallbackSalePrice = Math.max(0, Number(options.salePriceHT) || 0);
    return {
      title: sanitize(String(parsed.title || trimmed)),
      portions: Math.max(1, Math.round(Number(parsed.portions) || 1)),
      salePriceHT: parsedSalePrice > 0 ? parsedSalePrice : fallbackSalePrice,
      ingredients,
    };
  } catch {
    return fallbackTemplateFromLabel(trimmed, options);
  }
}
