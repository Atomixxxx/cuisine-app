import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { ProductTrace } from '../types';
import { PRODUCT_CATEGORIES } from '../types';
import type { LabelOCRResult } from './ocr';

const GS1_GROUP_SEPARATOR = String.fromCharCode(29);
const GS1_PREFIX_RE = /^\]C1/;

export interface ProductFormPrefill {
  productName?: string;
  supplier?: string;
  lotNumber?: string;
  expirationDate?: Date;
  receptionDate?: Date;
  category?: string;
  allergens?: string[];
}

interface BuildProductFormPrefillOptions {
  barcode?: string;
  latestProduct?: ProductTrace | null;
  now?: Date;
}

interface ParsedGs1BarcodeData {
  lotNumber?: string;
  expirationDate?: Date;
}

const parseYYMMDD = (value: string): Date | undefined => {
  if (!/^\d{6}$/.test(value)) return undefined;

  const yearYY = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (!Number.isFinite(month) || month < 1 || month > 12) return undefined;

  const year = yearYY >= 80 ? 1900 + yearYY : 2000 + yearYY;
  const resolvedDay = day === 0 ? new Date(year, month, 0).getDate() : day;
  const parsed = new Date(year, month - 1, resolvedDay);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== resolvedDay
  ) {
    return undefined;
  }

  return parsed;
};

const hasGs1Shape = (value: string): boolean => {
  const compact = value.replace(new RegExp(GS1_GROUP_SEPARATOR, 'g'), '');
  return (
    value.includes('(') ||
    value.includes(GS1_GROUP_SEPARATOR) ||
    GS1_PREFIX_RE.test(value) ||
    /^\d{16,}$/.test(compact)
  );
};

const parseParenthesizedGs1 = (value: string): ParsedGs1BarcodeData => {
  const lotMatch = value.match(/\(10\)([^()]+)/);
  const expirationMatch = value.match(/\((17|15)\)(\d{6})/);

  const lotNumber = lotMatch?.[1]?.trim() || undefined;
  const expirationDate = expirationMatch?.[2] ? parseYYMMDD(expirationMatch[2]) : undefined;

  return { lotNumber, expirationDate };
};

const parseRawGs1 = (value: string): ParsedGs1BarcodeData => {
  let lotNumber: string | undefined;
  let expirationDate: Date | undefined;

  let index = 0;
  while (index < value.length - 1) {
    if (value[index] === GS1_GROUP_SEPARATOR) {
      index += 1;
      continue;
    }

    const ai = value.slice(index, index + 2);
    if (ai === '01') {
      if (/^\d{14}$/.test(value.slice(index + 2, index + 16))) {
        index += 16;
      } else {
        index += 1;
      }
      continue;
    }

    if (ai === '17' || ai === '15') {
      const dateChunk = value.slice(index + 2, index + 8);
      if (!expirationDate) {
        expirationDate = parseYYMMDD(dateChunk);
      }
      index += 8;
      continue;
    }

    if (ai === '10') {
      const start = index + 2;
      let end = start;
      while (end < value.length && value[end] !== GS1_GROUP_SEPARATOR) {
        end += 1;
      }

      const candidate = value.slice(start, end).trim();
      if (candidate) lotNumber = candidate;
      index = end + (value[end] === GS1_GROUP_SEPARATOR ? 1 : 0);
      continue;
    }

    index += 1;
  }

  return { lotNumber, expirationDate };
};

export const parseGs1BarcodeData = (barcode?: string): ParsedGs1BarcodeData => {
  if (!barcode) return {};

  const normalized = barcode.replace(GS1_PREFIX_RE, '').trim();
  if (!normalized || !hasGs1Shape(normalized)) return {};

  if (normalized.includes('(')) return parseParenthesizedGs1(normalized);
  return parseRawGs1(normalized);
};

const inferShelfLifeDays = (product: ProductTrace): number | null => {
  const reception = new Date(product.receptionDate);
  const expiration = new Date(product.expirationDate);
  const days = differenceInCalendarDays(expiration, reception);
  if (!Number.isFinite(days) || days <= 0 || days > 365) return null;
  return days;
};

export const buildProductFormPrefill = ({
  barcode,
  latestProduct,
  now = new Date(),
}: BuildProductFormPrefillOptions): ProductFormPrefill => {
  const parsed = parseGs1BarcodeData(barcode);
  const prefill: ProductFormPrefill = {};

  if (latestProduct) {
    prefill.productName = latestProduct.productName;
    prefill.supplier = latestProduct.supplier;
    prefill.category = latestProduct.category;
    if (latestProduct.allergens?.length) prefill.allergens = latestProduct.allergens;
  }

  if (parsed.lotNumber) prefill.lotNumber = parsed.lotNumber;
  if (parsed.expirationDate) {
    prefill.expirationDate = parsed.expirationDate;
  } else if (latestProduct) {
    const shelfLifeDays = inferShelfLifeDays(latestProduct);
    if (shelfLifeDays) {
      prefill.expirationDate = addDays(startOfDay(now), shelfLifeDays);
    }
  }

  return prefill;
};

/* ── Label OCR → prefill conversion ── */

const parseDateString = (value: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d;
};

const matchCategory = (raw: string): string | undefined => {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const match = PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (match) return match;
  // Fuzzy match: check if the OCR category contains a known category name
  return PRODUCT_CATEGORIES.find((c) => lower.includes(c.toLowerCase())) ?? undefined;
};

export const mapLabelOcrToPrefill = (ocr: LabelOCRResult): ProductFormPrefill => {
  const prefill: ProductFormPrefill = {};

  if (ocr.productName) prefill.productName = ocr.productName;
  if (ocr.lotNumber) prefill.lotNumber = ocr.lotNumber;
  if (ocr.estampilleSanitaire) prefill.supplier = ocr.estampilleSanitaire;

  const expDate = parseDateString(ocr.expirationDate);
  if (expDate) prefill.expirationDate = expDate;

  const pkgDate = parseDateString(ocr.packagingDate);
  if (pkgDate) prefill.receptionDate = pkgDate;

  const cat = matchCategory(ocr.category);
  if (cat) prefill.category = cat;

  return prefill;
};

export const mergePrefills = (
  base: ProductFormPrefill,
  overlay: ProductFormPrefill,
): ProductFormPrefill => {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined && value !== '') {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
};
