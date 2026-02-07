const LEGAL_SUFFIXES = ['sas', 'sasu', 'sarl', 'sa', 'eurl', 'sci', 'snc', 'inc', 'llc', 'ltd'];

export const KNOWN_SUPPLIERS = ['Metro', 'Pomona', 'Transgourmet', 'Sysco', 'PassionFroid', 'Pro a Pro', 'Brake France', "Giney's"];

const SUPPLIER_ALIASES: Record<string, string> = {
  metro: 'Metro',
  metrofrance: 'Metro',
  transgourmet: 'Transgourmet',
  transgourmetfrance: 'Transgourmet',
  sysco: 'Sysco',
  syscofrance: 'Sysco',
  pomona: 'Pomona',
  groupepomona: 'Pomona',
  passionfroid: 'PassionFroid',
  proapro: 'Pro a Pro',
  brake: 'Brake France',
  brakefrance: 'Brake France',
  gineys: "Giney's",
  giney: "Giney's",
  gineyssas: "Giney's",
};

export function normalizeSupplierKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !LEGAL_SUFFIXES.includes(token))
    .join('');
}

function toDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return trimmed
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ');
}

export function canonicalizeSupplierName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = normalizeSupplierKey(trimmed);
  if (!normalized) return toDisplayName(trimmed);

  const direct = SUPPLIER_ALIASES[normalized];
  if (direct) return direct;

  // fallback partial alias check for noisy OCR outputs
  for (const [aliasKey, canonical] of Object.entries(SUPPLIER_ALIASES)) {
    if (normalized.includes(aliasKey) || aliasKey.includes(normalized)) return canonical;
  }

  return toDisplayName(trimmed);
}

export function buildSupplierQuickPicks(dynamicSuppliers: string[]): string[] {
  const merged = [...KNOWN_SUPPLIERS, ...dynamicSuppliers];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of merged) {
    const canonical = canonicalizeSupplierName(value);
    if (!canonical) continue;
    const key = normalizeSupplierKey(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(canonical);
  }
  return unique.slice(0, 16);
}

export function isNewSupplier(candidate: string, knownSuppliers: string[]): boolean {
  const normalizedCandidate = normalizeSupplierKey(canonicalizeSupplierName(candidate));
  if (!normalizedCandidate) return false;
  const knownSet = new Set(
    [...KNOWN_SUPPLIERS, ...knownSuppliers]
      .map((value) => normalizeSupplierKey(canonicalizeSupplierName(value)))
      .filter(Boolean),
  );
  return !knownSet.has(normalizedCandidate);
}
