import { describe, expect, it } from 'vitest';
import { canonicalizeSupplierName, isNewSupplier, normalizeSupplierKey } from './suppliers';

describe('suppliers service', () => {
  it('normalizes supplier aliases', () => {
    expect(canonicalizeSupplierName('trans gourmet france sas')).toBe('Transgourmet');
    expect(canonicalizeSupplierName('METRO france')).toBe('Metro');
    expect(canonicalizeSupplierName('GINEYS SAS')).toBe("Giney's");
    expect(normalizeSupplierKey('Pro-a-Pro SAS')).toBe('proapro');
  });

  it('detects new suppliers against known list', () => {
    expect(isNewSupplier('Nouveau Test Fournisseur', ['Metro'])).toBe(true);
    expect(isNewSupplier('Transgourmet france', ['Metro'])).toBe(false);
  });
});
