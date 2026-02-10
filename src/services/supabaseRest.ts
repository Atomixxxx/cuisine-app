import { getValidAccessToken } from './supabaseAuth';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const SUPABASE_WORKSPACE_ID = (import.meta.env.VITE_SUPABASE_WORKSPACE_ID ?? 'default').trim() || 'default';
export const SUPABASE_STORAGE_BUCKET = (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'cuisine-media').trim() || 'cuisine-media';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

type Primitive = string | number | boolean;
type QueryValue = Primitive | null | undefined;

async function getAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const accessToken = await getValidAccessToken();
  const bearerToken = accessToken && accessToken.trim() ? accessToken : SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${bearerToken}`,
    ...extra,
  };
}

function buildTableUrl(
  table: string,
  options?: {
    select?: string;
    limit?: number;
    offset?: number;
    order?: string;
    filters?: Array<{ column: string; op: string; value: QueryValue }>;
  },
): string {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (options?.select) url.searchParams.set('select', options.select);
  if (typeof options?.limit === 'number') url.searchParams.set('limit', String(options.limit));
  if (typeof options?.offset === 'number') url.searchParams.set('offset', String(options.offset));
  if (options?.order) url.searchParams.set('order', options.order);
  options?.filters?.forEach((filter) => {
    if (filter.value === undefined || filter.value === null) return;
    url.searchParams.append(filter.column, `${filter.op}.${String(filter.value)}`);
  });
  return url.toString();
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase error (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchRows<T>(
  table: string,
  options?: {
    select?: string;
    limit?: number;
    offset?: number;
    order?: string;
    filters?: Array<{ column: string; op: string; value: QueryValue }>;
  },
): Promise<T[]> {
  const response = await fetch(buildTableUrl(table, options), {
    headers: await getAuthHeaders({
      Accept: 'application/json',
    }),
  });
  return parseJson<T[]>(response);
}

export async function upsertRows<T>(
  table: string,
  rows: T[],
  onConflict: string,
): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: await getAuthHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    }),
    body: JSON.stringify(rows),
  });
  return parseJson<T[]>(response);
}

export async function deleteRows(
  table: string,
  filters: Array<{ column: string; op: string; value: QueryValue }>,
): Promise<void> {
  const url = buildTableUrl(table, { filters });
  const response = await fetch(url, {
    method: 'DELETE',
    headers: await getAuthHeaders({
      Prefer: 'return=minimal',
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase delete error (${response.status})`);
  }
}

function getFileExtension(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('pdf')) return 'pdf';
  return 'jpg';
}

function buildStoragePublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${path}`;
}

export async function uploadBlob(path: string, blob: Blob): Promise<string> {
  const normalizedPath = path.replace(/^\/+/, '');
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${normalizedPath}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: await getAuthHeaders({
      'x-upsert': 'true',
      'Content-Type': blob.type || 'application/octet-stream',
    }),
    body: blob,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase storage upload error (${response.status})`);
  }
  return buildStoragePublicUrl(normalizedPath);
}

export async function removeStorageFiles(publicUrls: string[]): Promise<void> {
  if (publicUrls.length === 0) return;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
  const paths = publicUrls
    .map((url) => (url.startsWith(prefix) ? url.slice(prefix.length) : null))
    .filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;

  for (const path of paths) {
    const endpoint = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${path}`;
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Supabase storage delete error (${response.status})`);
    }
  }
}

export function buildProductPhotoPath(productId: string, blob: Blob): string {
  const ext = getFileExtension(blob);
  return `${SUPABASE_WORKSPACE_ID}/products/${productId}/${Date.now()}.${ext}`;
}

export function buildInvoiceImagePath(invoiceId: string, index: number, blob: Blob): string {
  const ext = getFileExtension(blob);
  return `${SUPABASE_WORKSPACE_ID}/invoices/${invoiceId}/${index}-${Date.now()}.${ext}`;
}
