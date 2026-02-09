import { compressImage, normalizeKeyPart, sanitize } from '../../utils';

export const INVOICE_IMAGE_COMPRESSION_THRESHOLD_BYTES = 350 * 1024;
export const INVOICE_IMAGE_MAX_WIDTH = 1600;
export const INVOICE_IMAGE_QUALITY = 0.82;

export function sanitizeAllergens(allergens?: string[]): string[] | undefined {
  if (!allergens || allergens.length === 0) return undefined;
  const deduplicated = Array.from(
    new Set(
      allergens
        .map((allergen) => sanitize(allergen).trim())
        .filter(Boolean),
    ),
  );
  return deduplicated.length > 0 ? deduplicated : undefined;
}

export function buildPriceKey(itemName: string, supplier: string): string {
  return `${normalizeKeyPart(itemName)}_${normalizeKeyPart(supplier)}`;
}

export async function compressInvoiceImages(images: Blob[]): Promise<Blob[]> {
  if (images.length === 0) return [];
  return Promise.all(
    images.map(async (image) => {
      if (image.size < INVOICE_IMAGE_COMPRESSION_THRESHOLD_BYTES) return image;
      return compressImage(image, INVOICE_IMAGE_MAX_WIDTH, INVOICE_IMAGE_QUALITY);
    }),
  );
}
