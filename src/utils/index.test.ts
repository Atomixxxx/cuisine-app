import { describe, expect, it } from 'vitest';
import { blobToBase64, normalizeKeyPart, repairMojibake, sanitize } from './index';

describe('text encoding repair', () => {
  it('repairs common mojibake sequences', () => {
    expect(repairMojibake('Reponse RÃ©sumÃ©e')).toBe('Reponse Résumée');
  });

  it('keeps normal text unchanged', () => {
    expect(repairMojibake('Texte normal')).toBe('Texte normal');
  });

  it('repairs before sanitizing content', () => {
    const value = sanitize('<b>NumÃ©ro de facture</b>');
    expect(value).toBe('Numéro de facture');
  });
});

describe('shared utils', () => {
  it('normalizes key parts for deterministic keys', () => {
    expect(normalizeKeyPart('  Crème   Brûlée  ')).toBe('creme brulee');
  });

  it('converts blob to base64', async () => {
    const blob = {
      arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    } as unknown as Blob;
    await expect(blobToBase64(blob)).resolves.toBe('YWJj');
  });
});
