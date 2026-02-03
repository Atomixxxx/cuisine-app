import { format, isToday, isYesterday } from 'date-fns';
import { fr } from 'date-fns/locale';
import DOMPurify from 'dompurify';

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
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Compress an image blob by resizing and converting to JPEG.
 * maxWidth: max pixel width (default 1200). quality: JPEG quality 0-1 (default 0.7).
 */
export async function compressImage(blob: Blob, maxWidth = 1200, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  const scale = width > maxWidth ? maxWidth / width : 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return blob;
  }

  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const compressed = await canvas.convertToBlob({ type: 'image/jpeg', quality });
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
