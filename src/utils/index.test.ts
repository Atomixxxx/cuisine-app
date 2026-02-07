import { describe, expect, it } from 'vitest';
import { repairMojibake, sanitize } from './index';

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

