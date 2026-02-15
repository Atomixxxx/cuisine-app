import { describe, expect, it } from 'vitest';
import { canonicalizeSupplierName, isNewSupplier, normalizeSupplierKey } from './suppliers';

describe('suppliers service', () => {
  it('normalizes supplier aliases', () => {
    expect(canonicalizeSupplierName('trans gourmet france sas')).toBe('Transgourmet');
    expect(canonicalizeSupplierName('METRO france')).toBe('Metro');
    expect(canonicalizeSupplierName('MÉTRO')).toBe('Metro');
    expect(canonicalizeSupplierName('GINEYS SAS')).toBe("Giney's");
    expect(canonicalizeSupplierName('TLM')).toBe('Toute la Maree');
    expect(canonicalizeSupplierName('Toute la marée')).toBe('Toute la Maree');
    expect(canonicalizeSupplierName('A.J.E')).toBe('AJE');
    expect(canonicalizeSupplierName('Terrazur')).toBe('Terrazur');
    expect(normalizeSupplierKey('Pro-a-Pro SAS')).toBe('proapro');
  });

  it('detects new suppliers against known list', () => {
    expect(isNewSupplier('Nouveau Test Fournisseur', ['Metro'])).toBe(true);
    expect(isNewSupplier('Transgourmet france', ['Metro'])).toBe(false);
    expect(isNewSupplier('AJE', ['Metro'])).toBe(false);
  });
});
