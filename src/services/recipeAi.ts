import type { RecipeUnit } from '../types';
import { sanitize } from '../utils';
import { getApiKey } from './ocr';

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function callGemini(
  apiKey: string,
  parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>,
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<string | null> {
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: options?.temperature ?? 0.2,
      maxOutputTokens: options?.maxOutputTokens ?? 2048,
    },
  };
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text as string) || null;
}

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned) as Record<string, unknown>;
}

function parseIngredientsList(parsed: Record<string, unknown>): GeneratedRecipeIngredient[] {
  const raw = Array.isArray(parsed.ingredients) ? (parsed.ingredients as Record<string, unknown>[]) : [];
  return raw
    .map((line) => ({
      name: sanitize(String(line.name || '').trim()),
      quantity: Math.max(0, Number(line.quantity) || 0),
      unit: normalizeUnit(String(line.unit || 'unite')),
    }))
    .filter((line) => line.name.length > 0 && line.quantity > 0)
    .slice(0, 20);
}

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

  try {
    const textContent = await callGemini(apiKey, [{ text: prompt }]);
    if (!textContent) return fallbackTemplateFromLabel(trimmed, options);

    const parsed = extractJson(textContent);
    const ingredients = parseIngredientsList(parsed);
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

/**
 * Parse a free-text recipe (pasted or typed) into structured ingredients.
 * Example input: "Pate a crepes 1L: 250g farine, 4 oeufs, 500ml lait, 50g beurre fondu, 1 pincee sel"
 */
export async function parseRecipeFromText(
  text: string,
  catalog?: RecipeAiCatalogIngredient[],
): Promise<GeneratedRecipeTemplate> {
  const trimmed = text.trim();
  if (!trimmed) return { title: 'Recette', portions: 1, salePriceHT: 0, ingredients: [] };

  const apiKey = await getApiKey();
  if (!apiKey) return { title: 'Recette', portions: 1, salePriceHT: 0, ingredients: [] };

  const catalogPreview = (catalog || [])
    .filter((i) => i.unitPrice > 0)
    .slice(0, 40)
    .map((i) => `- ${i.name} | ${i.unitPrice.toFixed(4)} EUR/${i.unit}`)
    .join('\n');

  const prompt = `Tu es un chef executif expert en fiches techniques.
L'utilisateur a colle ou ecrit une recette en texte libre. Analyse-la et structure-la.

Texte de la recette:
"""
${trimmed}
"""

${catalogPreview ? `Cadencier disponible (utilise ces noms exacts quand possible):\n${catalogPreview}\n` : ''}

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
- Deduis le titre de la recette du texte.
- Extrais TOUS les ingredients avec leurs quantites et unites.
- Convertis les quantites informelles: "1 pincee" -> 2g, "1 c.a.s" -> 15ml, "1 c.a.c" -> 5ml, "1 verre" -> 200ml
- Si le texte dit "pour X personnes/portions/litres", utilise ca pour portions.
- Si tu reconnais un prix de vente potentiel, renseigne salePriceHT sinon 0.
- unit strictement parmi: kg,g,l,ml,unite`;

  try {
    const textContent = await callGemini(apiKey, [{ text: prompt }]);
    if (!textContent) return { title: trimmed.slice(0, 50), portions: 1, salePriceHT: 0, ingredients: [] };

    const parsed = extractJson(textContent);
    const ingredients = parseIngredientsList(parsed);
    return {
      title: sanitize(String(parsed.title || trimmed.slice(0, 50))),
      portions: Math.max(1, Math.round(Number(parsed.portions) || 1)),
      salePriceHT: Math.max(0, Number(parsed.salePriceHT) || 0),
      ingredients,
    };
  } catch {
    return { title: trimmed.slice(0, 50), portions: 1, salePriceHT: 0, ingredients: [] };
  }
}

/**
 * Parse a recipe from a photo (OCR) into structured ingredients.
 */
export async function parseRecipeFromImage(
  imageBlob: Blob,
  catalog?: RecipeAiCatalogIngredient[],
): Promise<GeneratedRecipeTemplate> {
  const apiKey = await getApiKey();
  if (!apiKey) return { title: 'Recette', portions: 1, salePriceHT: 0, ingredients: [] };

  const base64 = await blobToBase64(imageBlob);
  const mimeType = imageBlob.type || 'image/jpeg';

  const catalogPreview = (catalog || [])
    .filter((i) => i.unitPrice > 0)
    .slice(0, 40)
    .map((i) => `- ${i.name} | ${i.unitPrice.toFixed(4)} EUR/${i.unit}`)
    .join('\n');

  const prompt = `Tu es un chef executif expert en fiches techniques.
L'utilisateur a pris en photo une recette (manuscrite, imprimee, ou ecran). Analyse l'image et structure la recette.

${catalogPreview ? `Cadencier disponible (utilise ces noms exacts quand possible):\n${catalogPreview}\n` : ''}

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
- Lis le texte de la photo et extrais TOUS les ingredients avec leurs quantites.
- Convertis les quantites informelles en unites standard.
- Deduis le titre de la recette.
- unit strictement parmi: kg,g,l,ml,unite`;

  try {
    const textContent = await callGemini(apiKey, [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ], { maxOutputTokens: 4096 });
    if (!textContent) return { title: 'Recette', portions: 1, salePriceHT: 0, ingredients: [] };

    const parsed = extractJson(textContent);
    const ingredients = parseIngredientsList(parsed);
    return {
      title: sanitize(String(parsed.title || 'Recette photo')),
      portions: Math.max(1, Math.round(Number(parsed.portions) || 1)),
      salePriceHT: Math.max(0, Number(parsed.salePriceHT) || 0),
      ingredients,
    };
  } catch {
    return { title: 'Recette photo', portions: 1, salePriceHT: 0, ingredients: [] };
  }
}

export interface IngredientPriceEstimate {
  name: string;
  unit: RecipeUnit;
  estimatedPrice: number;
  source: string;
}

/**
 * Search for average market prices of ingredients via Gemini.
 * Used when ingredients are not in the local cadencier.
 */
export async function searchIngredientPrices(
  ingredientNames: Array<{ name: string; unit: RecipeUnit }>,
): Promise<IngredientPriceEstimate[]> {
  if (ingredientNames.length === 0) return [];

  const apiKey = await getApiKey();
  if (!apiKey) return [];

  const list = ingredientNames.map((i) => `- ${i.name} (${i.unit})`).join('\n');

  const prompt = `Tu es un expert en achat pour la restauration professionnelle en France.
Donne-moi le prix moyen professionnel (prix fournisseur, pas grande surface) pour chaque ingredient.

Ingredients a estimer:
${list}

Reponds UNIQUEMENT avec un JSON valide (pas de markdown):
{
  "prices": [
    { "name": "Nom ingredient", "unit": "kg|g|l|ml|unite", "estimatedPrice": 0.00, "source": "estimation marche pro France 2025" }
  ]
}

Regles:
- Prix en EUR, par unite indiquee (ex: prix au kg si unite=kg).
- Utilise des prix moyens professionnels realistes (Metro, Transgourmet, Pomona).
- Si tu n'es pas sur, donne une fourchette basse plutot que haute.
- "source" doit indiquer la base de ton estimation.`;

  try {
    const textContent = await callGemini(apiKey, [{ text: prompt }], { temperature: 0.3 });
    if (!textContent) return [];

    const parsed = extractJson(textContent);
    const prices = Array.isArray(parsed.prices) ? (parsed.prices as Record<string, unknown>[]) : [];
    return prices
      .map((p) => ({
        name: sanitize(String(p.name || '')),
        unit: normalizeUnit(String(p.unit || 'kg')),
        estimatedPrice: Math.max(0, Number(p.estimatedPrice) || 0),
        source: sanitize(String(p.source || 'estimation IA')),
      }))
      .filter((p) => p.name && p.estimatedPrice > 0);
  } catch {
    return [];
  }
}
