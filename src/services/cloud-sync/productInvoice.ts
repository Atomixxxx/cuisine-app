import type { Invoice, ProductTrace } from '../../types';
import {
  buildInvoiceImagePath,
  buildProductPhotoPath,
  deleteRows,
  fetchRows,
  removeStorageFiles,
  uploadBlob,
  upsertRows,
} from '../supabaseRest';
import { logger } from '../logger';
import { toDate, toIsoDate, withWorkspaceFilter, SUPABASE_WORKSPACE_ID } from './core';

interface ProductTraceRow {
  workspace_id: string;
  id: string;
  status: string;
  used_at?: string | null;
  barcode?: string | null;
  photo_url?: string | null;
  product_name: string;
  supplier: string;
  lot_number: string;
  reception_date: string;
  expiration_date: string;
  category: string;
  allergens: string[];
  scanned_at: string;
}

interface InvoiceRow {
  workspace_id: string;
  id: string;
  image_urls: string[];
  supplier: string;
  invoice_number: string;
  invoice_date: string;
  items: Invoice['items'];
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  ocr_text: string;
  tags: string[];
  scanned_at: string;
}

function toProductRow(value: ProductTrace, photoUrl: string | null): ProductTraceRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    status: value.status ?? 'active',
    used_at: value.usedAt ? toIsoDate(value.usedAt) : null,
    barcode: value.barcode ?? null,
    photo_url: photoUrl,
    product_name: value.productName,
    supplier: value.supplier,
    lot_number: value.lotNumber,
    reception_date: toIsoDate(value.receptionDate),
    expiration_date: toIsoDate(value.expirationDate),
    category: value.category,
    allergens: value.allergens ?? [],
    scanned_at: toIsoDate(value.scannedAt),
  };
}

function fromProductRow(value: ProductTraceRow): ProductTrace {
  return {
    id: value.id,
    status: value.status === 'used' ? 'used' : 'active',
    usedAt: value.used_at ? toDate(value.used_at) : undefined,
    barcode: value.barcode ?? undefined,
    photo: undefined,
    photoUrl: value.photo_url ?? undefined,
    productName: value.product_name,
    supplier: value.supplier,
    lotNumber: value.lot_number,
    receptionDate: toDate(value.reception_date),
    expirationDate: toDate(value.expiration_date),
    category: value.category,
    allergens: value.allergens ?? [],
    scannedAt: toDate(value.scanned_at),
  };
}

function normalizeInvoiceImageUrls(invoice: Invoice): string[] {
  if (invoice.imageUrls && invoice.imageUrls.length > 0) return invoice.imageUrls;
  return [];
}

function toInvoiceRow(value: Invoice, imageUrls: string[]): InvoiceRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    image_urls: imageUrls,
    supplier: value.supplier,
    invoice_number: value.invoiceNumber,
    invoice_date: toIsoDate(value.invoiceDate),
    items: value.items,
    total_ht: value.totalHT,
    total_tva: value.totalTVA,
    total_ttc: value.totalTTC,
    ocr_text: value.ocrText,
    tags: value.tags,
    scanned_at: toIsoDate(value.scannedAt),
  };
}

function fromInvoiceRow(value: InvoiceRow): Invoice {
  return {
    id: value.id,
    images: [],
    imageUrls: value.image_urls ?? [],
    supplier: value.supplier,
    invoiceNumber: value.invoice_number,
    invoiceDate: toDate(value.invoice_date),
    items: value.items ?? [],
    totalHT: value.total_ht,
    totalTVA: value.total_tva,
    totalTTC: value.total_ttc,
    ocrText: value.ocr_text,
    tags: value.tags ?? [],
    scannedAt: toDate(value.scanned_at),
  };
}

export async function fetchRemoteProducts(limit?: number, offset?: number): Promise<ProductTrace[]> {
  const rows = await fetchRows<ProductTraceRow>('product_traces', {
    filters: withWorkspaceFilter(),
    order: 'scanned_at.desc',
    limit,
    offset,
  });
  return rows.map(fromProductRow);
}

export async function fetchRemoteLatestProductByBarcode(barcode: string): Promise<ProductTrace | null> {
  const rows = await fetchRows<ProductTraceRow>('product_traces', {
    filters: withWorkspaceFilter([{ column: 'barcode', op: 'eq', value: barcode }]),
    order: 'scanned_at.desc',
    limit: 1,
  });
  if (rows.length === 0) return null;
  return fromProductRow(rows[0]);
}

export async function upsertRemoteProduct(value: ProductTrace): Promise<ProductTrace> {
  const existingRows = await fetchRows<ProductTraceRow>('product_traces', {
    filters: withWorkspaceFilter([{ column: 'id', op: 'eq', value: value.id }]),
    limit: 1,
  });
  const previousPhotoUrl = existingRows[0]?.photo_url ?? null;

  let nextPhotoUrl = value.photoUrl ?? previousPhotoUrl ?? null;
  let uploadedPhotoUrl: string | null = null;
  if (value.photo) {
    const path = buildProductPhotoPath(value.id, value.photo);
    try {
      const uploadedUrl = await uploadBlob(path, value.photo);
      if (uploadedUrl.trim().length > 0) {
        uploadedPhotoUrl = uploadedUrl;
        nextPhotoUrl = uploadedUrl;
      } else {
        logger.warn('product media upload returned empty url', { productId: value.id });
      }
    } catch (error) {
      logger.warn('product media upload failed; keeping local blob', { productId: value.id, error });
    }
  }

  await upsertRows<ProductTraceRow>('product_traces', [toProductRow(value, nextPhotoUrl)], 'workspace_id,id');

  if (previousPhotoUrl && nextPhotoUrl && previousPhotoUrl !== nextPhotoUrl) {
    await removeStorageFiles([previousPhotoUrl]);
  }

  return {
    ...value,
    photo: value.photo && !uploadedPhotoUrl ? value.photo : undefined,
    photoUrl: nextPhotoUrl ?? undefined,
  };
}

export async function deleteRemoteProduct(id: string): Promise<void> {
  const existingRows = await fetchRows<ProductTraceRow>('product_traces', {
    filters: withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]),
    limit: 1,
  });
  const current = existingRows[0];
  await deleteRows('product_traces', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
  if (current?.photo_url) {
    await removeStorageFiles([current.photo_url]);
  }
}

export async function fetchRemoteInvoices(limit?: number, offset?: number): Promise<Invoice[]> {
  const rows = await fetchRows<InvoiceRow>('invoices', {
    filters: withWorkspaceFilter(),
    order: 'scanned_at.desc',
    limit,
    offset,
  });
  return rows.map(fromInvoiceRow);
}

export async function upsertRemoteInvoice(value: Invoice): Promise<Invoice> {
  const existingRows = await fetchRows<InvoiceRow>('invoices', {
    filters: withWorkspaceFilter([{ column: 'id', op: 'eq', value: value.id }]),
    limit: 1,
  });
  const previousImageUrls = existingRows[0]?.image_urls ?? [];

  let imageUrls = normalizeInvoiceImageUrls(value);
  let uploadedAllImages = false;
  if (value.images.length > 0) {
    const uploadedUrls: string[] = [];
    let uploadFailed = false;
    for (let index = 0; index < value.images.length; index += 1) {
      const image = value.images[index];
      const path = buildInvoiceImagePath(value.id, index, image);
      try {
        const uploadedUrl = await uploadBlob(path, image);
        if (uploadedUrl.trim().length === 0) {
          uploadFailed = true;
          logger.warn('invoice media upload returned empty url', { invoiceId: value.id, index });
          break;
        }
        uploadedUrls.push(uploadedUrl);
      } catch (error) {
        uploadFailed = true;
        logger.warn('invoice media upload failed; keeping local blobs', { invoiceId: value.id, index, error });
        break;
      }
    }
    if (!uploadFailed && uploadedUrls.length === value.images.length) {
      imageUrls = uploadedUrls;
      uploadedAllImages = true;
    } else if (imageUrls.length === 0 && previousImageUrls.length > 0) {
      imageUrls = previousImageUrls;
    }
  } else if (imageUrls.length === 0 && previousImageUrls.length > 0) {
    imageUrls = previousImageUrls;
  }

  await upsertRows<InvoiceRow>('invoices', [toInvoiceRow(value, imageUrls)], 'workspace_id,id');

  const removedUrls = previousImageUrls.filter((url) => !imageUrls.includes(url));
  if (removedUrls.length > 0) {
    await removeStorageFiles(removedUrls);
  }

  return {
    ...value,
    images: uploadedAllImages ? [] : value.images,
    imageUrls,
  };
}

export async function deleteRemoteInvoice(id: string): Promise<void> {
  const existingRows = await fetchRows<InvoiceRow>('invoices', {
    filters: withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]),
    limit: 1,
  });
  const current = existingRows[0];
  await deleteRows('invoices', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
  if (current?.image_urls?.length) {
    await removeStorageFiles(current.image_urls);
  }
}
