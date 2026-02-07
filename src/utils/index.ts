import { format, isToday, isYesterday } from 'date-fns';
import { fr } from 'date-fns/locale';
import DOMPurify from 'dompurify';

function mojibakeScore(value: string): number {
  const matches = value.match(/[ÃÂâ]/g);
  return matches ? matches.length : 0;
}

/**
 * Attempts to repair common UTF-8/latin1 mojibake like "RÃ©ponse" -> "Réponse".
 * Keeps original text when conversion is uncertain.
 */
export function repairMojibake(text: string): string {
  if (!text || !/[ÃÂâ]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!decoded || decoded.includes('\ufffd')) return text;
    if (mojibakeScore(decoded) > mojibakeScore(text)) return text;
    return decoded;
  } catch {
    return text;
  }
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return `Aujourd'hui ${format(d, 'HH:mm', { locale: fr })}`;
  if (isYesterday(d)) return `Hier ${format(d, 'HH:mm', { locale: fr })}`;
  return format(d, 'dd/MM/yyyy HH:mm', { locale: fr });
}

export function formatDateShort(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: fr });
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function vibrate(duration = 50) {
  if (navigator.vibrate) navigator.vibrate(duration);
}

export function blobToUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export async function fileToBlob(file: File): Promise<Blob> {
  return new Blob([await file.arrayBuffer()], { type: file.type });
}

/**
 * Sanitize a string to prevent XSS. Strips all HTML tags and attributes.
 * Use at input boundaries: OCR results, form submissions, barcode scans.
 */
export function sanitize(text: string): string {
  const repaired = repairMojibake(text);
  return DOMPurify.sanitize(repaired, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

export function sanitizeInput(text: string): string {
  return sanitize(text);
}

/**
 * Compress an image blob by resizing and converting to JPEG.
 * maxWidth: max pixel width (default 1200). quality: JPEG quality 0-1 (default 0.7).
 */
export async function compressImage(blob: Blob, maxWidth = 1200, quality = 0.7): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  const { width, height } = bitmap;

  const scale = width > maxWidth ? maxWidth / width : 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canUseOffscreen = typeof OffscreenCanvas !== 'undefined';
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (canUseOffscreen) {
    canvas = new OffscreenCanvas(w, h);
  } else if (typeof document !== 'undefined') {
    const element = document.createElement('canvas');
    element.width = w;
    element.height = h;
    canvas = element;
  } else {
    bitmap.close();
    return blob;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return blob;
  }

  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let compressed: Blob;
  if (canUseOffscreen && 'convertToBlob' in canvas) {
    compressed = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality });
  } else {
    compressed = await new Promise<Blob>((resolve) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => resolve(b || blob),
        'image/jpeg',
        quality
      );
    });
  }
  // Only use compressed version if it's actually smaller
  return compressed.size < blob.size ? compressed : blob;
}

export function generateSupplierColor(supplier: string): string {
  let hash = 0;
  for (let i = 0; i < supplier.length; i++) {
    hash = supplier.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}
