import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import type { ProductTrace } from '../types';
import { buildProductFormPrefill, parseGs1BarcodeData } from './productScan';

const makeProduct = (overrides: Partial<ProductTrace> = {}): ProductTrace => ({
  id: 'p-1',
  barcode: '0103453120000011',
  productName: 'Saumon fume',
  supplier: 'Pomona',
  lotNumber: 'LOT-OLD',
  receptionDate: new Date('2026-01-10T00:00:00.000Z'),
  expirationDate: new Date('2026-01-20T00:00:00.000Z'),
  category: 'Poisson',
  allergens: ['Poissons'],
  scannedAt: new Date('2026-01-10T08:00:00.000Z'),
  ...overrides,
});

describe('productScan service', () => {
  it('parses lot and expiration from parenthesized GS1 barcode', () => {
    const parsed = parseGs1BarcodeData('(01)03712345678903(17)260228(10)LOT-42');
    expect(parsed.lotNumber).toBe('LOT-42');
    expect(parsed.expirationDate).toBeDefined();
    expect(format(parsed.expirationDate!, 'yyyy-MM-dd')).toBe('2026-02-28');
  });

  it('parses raw GS1 barcode with FNC1 separator', () => {
    const gs = String.fromCharCode(29);
    const parsed = parseGs1BarcodeData(`010345312000001110BATCH42${gs}17260315`);
    expect(parsed.lotNumber).toBe('BATCH42');
    expect(parsed.expirationDate).toBeDefined();
    expect(format(parsed.expirationDate!, 'yyyy-MM-dd')).toBe('2026-03-15');
  });

  it('builds prefill from latest product and gives priority to GS1 values', () => {
    const latest = makeProduct();
    const prefill = buildProductFormPrefill({
      barcode: '(01)03712345678903(17)260301(10)LOT-NEW',
      latestProduct: latest,
    });

    expect(prefill.productName).toBe('Saumon fume');
    expect(prefill.supplier).toBe('Pomona');
    expect(prefill.category).toBe('Poisson');
    expect(prefill.allergens).toEqual(['Poissons']);
    expect(prefill.lotNumber).toBe('LOT-NEW');
    expect(prefill.expirationDate).toBeDefined();
    expect(format(prefill.expirationDate!, 'yyyy-MM-dd')).toBe('2026-03-01');
  });

  it('infers expiration from historical shelf life when GS1 has no date', () => {
    const latest = makeProduct({
      receptionDate: new Date('2026-01-01T00:00:00.000Z'),
      expirationDate: new Date('2026-01-08T00:00:00.000Z'),
    });

    const prefill = buildProductFormPrefill({
      barcode: '3017620425035',
      latestProduct: latest,
      now: new Date('2026-02-10T09:00:00.000Z'),
    });

    expect(prefill.expirationDate).toBeDefined();
    expect(format(prefill.expirationDate!, 'yyyy-MM-dd')).toBe('2026-02-17');
  });
});
