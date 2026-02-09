import type { Ingredient } from '../types';

const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  Gluten: ['ble', 'farine', 'pain', 'pate', 'semoule', 'orge', 'seigle', 'avoine'],
  Crustaces: ['crevette', 'homard', 'langoustine', 'crabe', 'crustace'],
  Oeufs: ['oeuf', 'ovoproduit', 'albumine', 'mayonnaise'],
  Poissons: ['poisson', 'saumon', 'thon', 'cabillaud', 'anchois', 'sardine'],
  Arachides: ['arachide', 'cacahuete', 'beurre de cacahuete'],
  Soja: ['soja', 'tofu', 'sauce soja'],
  Lait: ['lait', 'beurre', 'creme', 'fromage', 'yaourt', 'mozzarella'],
  'Fruits a coque': ['amande', 'noisette', 'noix', 'pistache', 'pecan', 'cajou'],
  Celeri: ['celeri'],
  Moutarde: ['moutarde'],
  'Graines de sesame': ['sesame', 'tahini'],
  Sulfites: ['sulfite', 'vin blanc', 'vinaigre'],
  Lupin: ['lupin'],
  Mollusques: ['moule', 'huitre', 'palourde', 'coquillage', 'mollusque'],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function detectAllergensFromIngredientName(name: string): string[] {
  const normalized = normalize(name);
  if (!normalized) return [];

  const detected: string[] = [];
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      detected.push(allergen);
    }
  }
  return detected;
}

export function computeAutoRecipeAllergens(
  ingredientIds: string[],
  ingredientMap: Map<string, Ingredient>,
): string[] {
  const dedup = new Set<string>();
  for (const ingredientId of ingredientIds) {
    const ingredient = ingredientMap.get(ingredientId);
    if (!ingredient) continue;
    for (const allergen of detectAllergensFromIngredientName(ingredient.name)) {
      dedup.add(allergen);
    }
  }
  return Array.from(dedup).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function mergeRecipeAllergens(autoDetected: string[], manual: string[]): string[] {
  return Array.from(new Set([...autoDetected, ...manual])).sort((a, b) => a.localeCompare(b, 'fr'));
}
