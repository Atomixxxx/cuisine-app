import type { Invoice, Ingredient } from '../types';
import { findBestIngredientMatch } from './ingredientMatch';
import { db } from './db';

interface SyncResult {
  updated: number;
  created: number;
}

/**
 * After saving an invoice, automatically update (or create) matching ingredients
 * with the price and conditioning info extracted from the invoice items.
 */
export async function syncInvoiceToIngredients(invoice: Invoice): Promise<SyncResult> {
  const allIngredients = await db.ingredients.toArray();
  let updated = 0;
  let created = 0;

  for (const item of invoice.items) {
    const designation = item.designation.trim();
    if (!designation || item.unitPriceHT <= 0) continue;

    const match = findBestIngredientMatch(designation, allIngredients);

    if (match) {
      const ing = match.ingredient;
      const cq = item.conditioningQuantity && item.conditioningQuantity > 1
        ? item.conditioningQuantity
        : undefined;

      // Update if price changed or conditioning is newly available
      const priceChanged = Math.abs(ing.unitPrice - item.unitPriceHT) > 0.001;
      const conditioningNew = cq && !ing.conditioningQuantity;
      const conditioningChanged = cq && ing.conditioningQuantity && cq !== ing.conditioningQuantity;

      if (priceChanged || conditioningNew || conditioningChanged) {
        const patch: Partial<Ingredient> = { unitPrice: item.unitPriceHT };
        if (cq) patch.conditioningQuantity = cq;
        if (!ing.supplierId && invoice.supplier) patch.supplierId = invoice.supplier;

        await db.ingredients.update(ing.id, patch);
        // Update local list for subsequent matches
        Object.assign(ing, patch);
        updated++;
      }
    }
    // Don't auto-create ingredients from invoices (they might not be direct recipe ingredients)
  }

  return { updated, created };
}
