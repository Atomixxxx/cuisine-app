import type { IngredientUnit, PriceHistory } from '../../types';
import { deleteRows, fetchRows, upsertRows } from '../supabaseRest';
import { toDate, toIsoDate, withWorkspaceFilter, SUPABASE_WORKSPACE_ID } from './core';

interface PriceHistoryRow {
  workspace_id: string;
  id: string;
  item_name: string;
  supplier: string;
  prices: Array<{ date: string; price: number }>;
  average_price: number;
  min_price: number;
  max_price: number;
  unit?: IngredientUnit | null;
}

function toPriceHistoryRow(value: PriceHistory): PriceHistoryRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    item_name: value.itemName,
    supplier: value.supplier,
    prices: value.prices.map((entry) => ({ date: toIsoDate(entry.date), price: entry.price })),
    average_price: value.averagePrice,
    min_price: value.minPrice,
    max_price: value.maxPrice,
    unit: value.unit ?? null,
  };
}

function fromPriceHistoryRow(value: PriceHistoryRow): PriceHistory {
  return {
    id: value.id,
    itemName: value.item_name,
    supplier: value.supplier,
    prices: (value.prices ?? []).map((entry) => ({ date: toDate(entry.date), price: entry.price })),
    averagePrice: value.average_price,
    minPrice: value.min_price,
    maxPrice: value.max_price,
    unit: value.unit ?? undefined,
  };
}

export async function fetchRemotePriceHistory(): Promise<PriceHistory[]> {
  const rows = await fetchRows<PriceHistoryRow>('price_history', {
    filters: withWorkspaceFilter(),
    order: 'item_name.asc',
  });
  return rows.map(fromPriceHistoryRow);
}

export async function replaceRemotePriceHistory(entries: PriceHistory[]): Promise<void> {
  await deleteRows('price_history', withWorkspaceFilter());
  if (entries.length === 0) return;
  await upsertRows<PriceHistoryRow>(
    'price_history',
    entries.map(toPriceHistoryRow),
    'workspace_id,id',
  );
}
