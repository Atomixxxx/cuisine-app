import type {
  AppSettings,
  Equipment,
  Ingredient,
  Invoice,
  OilChangeRecord,
  PriceHistory,
  ProductTrace,
  Recipe,
  RecipeIngredient,
  Task,
  TemperatureRecord,
} from '../types';
import {
  SUPABASE_WORKSPACE_ID,
  buildInvoiceImagePath,
  buildProductPhotoPath,
  deleteRows,
  fetchRows,
  isSupabaseConfigured,
  removeStorageFiles,
  uploadBlob,
  upsertRows,
} from './supabaseRest';

type MaybeDate = Date | string;

interface AppSettingsRow {
  workspace_id: string;
  id: string;
  establishment_name: string;
  dark_mode: boolean;
  onboarding_done: boolean;
  price_alert_threshold: number;
  gemini_api_key?: string | null;
}

interface EquipmentRow {
  workspace_id: string;
  id: string;
  name: string;
  type: Equipment['type'];
  min_temp: number;
  max_temp: number;
  sort_order: number;
}

interface TemperatureRecordRow {
  workspace_id: string;
  id: string;
  equipment_id: string;
  temperature: number;
  timestamp: string;
  is_compliant: boolean;
  signature?: string | null;
}

interface OilChangeRecordRow {
  workspace_id: string;
  id: string;
  fryer_id: string;
  changed_at: string;
  action: OilChangeRecord['action'];
  operator?: string | null;
}

interface TaskRow {
  workspace_id: string;
  id: string;
  title: string;
  category: Task['category'];
  priority: Task['priority'];
  completed: boolean;
  estimated_time?: number | null;
  notes?: string | null;
  recurring: Task['recurring'];
  created_at: string;
  completed_at?: string | null;
  archived: boolean;
  sort_order: number;
}

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

interface PriceHistoryRow {
  workspace_id: string;
  id: string;
  item_name: string;
  supplier: string;
  prices: Array<{ date: string; price: number }>;
  average_price: number;
  min_price: number;
  max_price: number;
}

interface IngredientRow {
  workspace_id: string;
  id: string;
  name: string;
  unit: Ingredient['unit'];
  unit_price: number;
  conditioning_quantity?: number | null;
  supplier_id?: string | null;
}

interface RecipeRow {
  workspace_id: string;
  id: string;
  title: string;
  portions: number;
  sale_price_ht: number;
  created_at: string;
  updated_at: string;
  allergens: string[];
}

interface RecipeIngredientRow {
  workspace_id: string;
  id: string;
  recipe_id: string;
  ingredient_id: string;
  required_quantity: number;
  required_unit: RecipeIngredient['requiredUnit'];
}

interface FetchTemperatureOptions {
  startDate?: Date;
  endDate?: Date;
  equipmentId?: string;
}

interface FetchOilChangeOptions {
  startDate?: Date;
  endDate?: Date;
  fryerId?: string;
}

function toIsoDate(value: MaybeDate): string {
  return new Date(value).toISOString();
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function withWorkspaceFilter(filters: Array<{ column: string; op: string; value: string }> = []) {
  return [{ column: 'workspace_id', op: 'eq', value: SUPABASE_WORKSPACE_ID }, ...filters];
}

function toSettingsRow(value: AppSettings): AppSettingsRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    establishment_name: value.establishmentName,
    dark_mode: value.darkMode,
    onboarding_done: value.onboardingDone,
    price_alert_threshold: value.priceAlertThreshold,
    gemini_api_key: value.geminiApiKey ?? null,
  };
}

function fromSettingsRow(value: AppSettingsRow): AppSettings {
  return {
    id: value.id,
    establishmentName: value.establishment_name,
    darkMode: value.dark_mode,
    onboardingDone: value.onboarding_done,
    priceAlertThreshold: value.price_alert_threshold,
    geminiApiKey: value.gemini_api_key ?? undefined,
  };
}

function toEquipmentRow(value: Equipment): EquipmentRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    name: value.name,
    type: value.type,
    min_temp: value.minTemp,
    max_temp: value.maxTemp,
    sort_order: value.order,
  };
}

function fromEquipmentRow(value: EquipmentRow): Equipment {
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    minTemp: value.min_temp,
    maxTemp: value.max_temp,
    order: value.sort_order,
  };
}

function toTemperatureRow(value: TemperatureRecord): TemperatureRecordRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    equipment_id: value.equipmentId,
    temperature: value.temperature,
    timestamp: toIsoDate(value.timestamp),
    is_compliant: value.isCompliant,
    signature: value.signature ?? null,
  };
}

function fromTemperatureRow(value: TemperatureRecordRow): TemperatureRecord {
  return {
    id: value.id,
    equipmentId: value.equipment_id,
    temperature: value.temperature,
    timestamp: toDate(value.timestamp),
    isCompliant: value.is_compliant,
    signature: value.signature ?? undefined,
  };
}

function toOilChangeRow(value: OilChangeRecord): OilChangeRecordRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    fryer_id: value.fryerId,
    changed_at: toIsoDate(value.changedAt),
    action: value.action,
    operator: value.operator ?? null,
  };
}

function fromOilChangeRow(value: OilChangeRecordRow): OilChangeRecord {
  return {
    id: value.id,
    fryerId: value.fryer_id,
    changedAt: toDate(value.changed_at),
    action: value.action,
    operator: value.operator ?? undefined,
  };
}

function toTaskRow(value: Task): TaskRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    title: value.title,
    category: value.category,
    priority: value.priority,
    completed: value.completed,
    estimated_time: value.estimatedTime ?? null,
    notes: value.notes ?? null,
    recurring: value.recurring,
    created_at: toIsoDate(value.createdAt),
    completed_at: value.completedAt ? toIsoDate(value.completedAt) : null,
    archived: value.archived,
    sort_order: value.order,
  };
}

function fromTaskRow(value: TaskRow): Task {
  return {
    id: value.id,
    title: value.title,
    category: value.category,
    priority: value.priority,
    completed: value.completed,
    estimatedTime: value.estimated_time ?? undefined,
    notes: value.notes ?? undefined,
    recurring: value.recurring,
    createdAt: toDate(value.created_at),
    completedAt: value.completed_at ? toDate(value.completed_at) : undefined,
    archived: value.archived,
    order: value.sort_order,
  };
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

function toPriceHistoryRow(value: PriceHistory): PriceHistoryRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    item_name: value.itemName,
    supplier: value.supplier,
    prices: value.prices.map((entry) => ({ date: toIsoDate(entry.date), price: entry.price })),
    average_price: value.averagePrice,
    min_price: value.minPrice,
    max_price: value.maxPrice,
  };
}

function fromPriceHistoryRow(value: PriceHistoryRow): PriceHistory {
  return {
    id: value.id,
    itemName: value.item_name,
    supplier: value.supplier,
    prices: (value.prices ?? []).map((entry) => ({ date: toDate(entry.date), price: entry.price })),
    averagePrice: value.average_price,
    minPrice: value.min_price,
    maxPrice: value.max_price,
  };
}

function toIngredientRow(value: Ingredient): IngredientRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    name: value.name,
    unit: value.unit,
    unit_price: value.unitPrice,
    conditioning_quantity: value.conditioningQuantity ?? null,
    supplier_id: value.supplierId ?? null,
  };
}

function fromIngredientRow(value: IngredientRow): Ingredient {
  return {
    id: value.id,
    name: value.name,
    unit: value.unit,
    unitPrice: value.unit_price,
    conditioningQuantity: value.conditioning_quantity ?? undefined,
    supplierId: value.supplier_id ?? undefined,
  };
}

function toRecipeRow(value: Recipe): RecipeRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    title: value.title,
    portions: value.portions,
    sale_price_ht: value.salePriceHT,
    created_at: toIsoDate(value.createdAt),
    updated_at: toIsoDate(value.updatedAt),
    allergens: value.allergens ?? [],
  };
}

function fromRecipeRow(value: RecipeRow): Recipe {
  return {
    id: value.id,
    title: value.title,
    portions: value.portions,
    salePriceHT: value.sale_price_ht,
    createdAt: toDate(value.created_at),
    updatedAt: toDate(value.updated_at),
    allergens: value.allergens ?? [],
  };
}

function toRecipeIngredientRow(value: RecipeIngredient): RecipeIngredientRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    recipe_id: value.recipeId,
    ingredient_id: value.ingredientId,
    required_quantity: value.requiredQuantity,
    required_unit: value.requiredUnit,
  };
}

function fromRecipeIngredientRow(value: RecipeIngredientRow): RecipeIngredient {
  return {
    id: value.id,
    recipeId: value.recipe_id,
    ingredientId: value.ingredient_id,
    requiredQuantity: value.required_quantity,
    requiredUnit: value.required_unit,
  };
}

export function isCloudSyncEnabled(): boolean {
  return isSupabaseConfigured;
}

export async function fetchRemoteSettings(): Promise<AppSettings[]> {
  const rows = await fetchRows<AppSettingsRow>('settings', {
    filters: withWorkspaceFilter(),
    order: 'id.asc',
  });
  return rows.map(fromSettingsRow);
}

export async function upsertRemoteSettings(value: AppSettings): Promise<void> {
  await upsertRows<AppSettingsRow>('settings', [toSettingsRow(value)], 'workspace_id,id');
}

export async function fetchRemoteEquipment(): Promise<Equipment[]> {
  const rows = await fetchRows<EquipmentRow>('equipment', {
    filters: withWorkspaceFilter(),
    order: 'sort_order.asc',
  });
  return rows.map(fromEquipmentRow);
}

export async function upsertRemoteEquipment(value: Equipment): Promise<void> {
  await upsertRows<EquipmentRow>('equipment', [toEquipmentRow(value)], 'workspace_id,id');
}

export async function deleteRemoteEquipment(id: string): Promise<void> {
  await deleteRows('equipment', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}

export async function fetchRemoteTemperatureRecords(options: FetchTemperatureOptions = {}): Promise<TemperatureRecord[]> {
  const filters = withWorkspaceFilter();
  if (options.equipmentId) filters.push({ column: 'equipment_id', op: 'eq', value: options.equipmentId });
  if (options.startDate) filters.push({ column: 'timestamp', op: 'gte', value: options.startDate.toISOString() });
  if (options.endDate) filters.push({ column: 'timestamp', op: 'lte', value: options.endDate.toISOString() });

  const rows = await fetchRows<TemperatureRecordRow>('temperature_records', {
    filters,
    order: 'timestamp.desc',
  });
  return rows.map(fromTemperatureRow);
}

export async function upsertRemoteTemperatureRecord(value: TemperatureRecord): Promise<void> {
  await upsertRows<TemperatureRecordRow>('temperature_records', [toTemperatureRow(value)], 'workspace_id,id');
}

export async function fetchRemoteOilChangeRecords(options: FetchOilChangeOptions = {}): Promise<OilChangeRecord[]> {
  const filters = withWorkspaceFilter();
  if (options.fryerId) filters.push({ column: 'fryer_id', op: 'eq', value: options.fryerId });
  if (options.startDate) filters.push({ column: 'changed_at', op: 'gte', value: options.startDate.toISOString() });
  if (options.endDate) filters.push({ column: 'changed_at', op: 'lte', value: options.endDate.toISOString() });

  const rows = await fetchRows<OilChangeRecordRow>('oil_change_records', {
    filters,
    order: 'changed_at.desc',
  });
  return rows.map(fromOilChangeRow);
}

export async function upsertRemoteOilChangeRecord(value: OilChangeRecord): Promise<void> {
  await upsertRows<OilChangeRecordRow>('oil_change_records', [toOilChangeRow(value)], 'workspace_id,id');
}

export async function deleteRemoteOilChangeRecord(id: string): Promise<void> {
  await deleteRows('oil_change_records', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}

export async function fetchRemoteTasks(): Promise<Task[]> {
  const rows = await fetchRows<TaskRow>('tasks', {
    filters: withWorkspaceFilter(),
    order: 'sort_order.asc',
  });
  return rows.map(fromTaskRow);
}

export async function upsertRemoteTask(value: Task): Promise<void> {
  await upsertRows<TaskRow>('tasks', [toTaskRow(value)], 'workspace_id,id');
}

export async function deleteRemoteTask(id: string): Promise<void> {
  await deleteRows('tasks', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
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
  if (value.photo) {
    const path = buildProductPhotoPath(value.id, value.photo);
    nextPhotoUrl = await uploadBlob(path, value.photo);
  }

  await upsertRows<ProductTraceRow>('product_traces', [toProductRow(value, nextPhotoUrl)], 'workspace_id,id');

  if (previousPhotoUrl && nextPhotoUrl && previousPhotoUrl !== nextPhotoUrl) {
    await removeStorageFiles([previousPhotoUrl]);
  }

  return {
    ...value,
    photo: undefined,
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
  if (value.images.length > 0) {
    const uploadedUrls: string[] = [];
    for (let index = 0; index < value.images.length; index += 1) {
      const image = value.images[index];
      const path = buildInvoiceImagePath(value.id, index, image);
      const uploadedUrl = await uploadBlob(path, image);
      uploadedUrls.push(uploadedUrl);
    }
    imageUrls = uploadedUrls;
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
    images: [],
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

export async function fetchRemoteIngredients(): Promise<Ingredient[]> {
  const rows = await fetchRows<IngredientRow>('ingredients', {
    filters: withWorkspaceFilter(),
    order: 'name.asc',
  });
  return rows.map(fromIngredientRow);
}

export async function upsertRemoteIngredient(value: Ingredient): Promise<void> {
  await upsertRows<IngredientRow>('ingredients', [toIngredientRow(value)], 'workspace_id,id');
}

export async function deleteRemoteIngredient(id: string): Promise<void> {
  await deleteRows('ingredients', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}

export async function fetchRemoteRecipes(): Promise<Recipe[]> {
  const rows = await fetchRows<RecipeRow>('recipes', {
    filters: withWorkspaceFilter(),
    order: 'updated_at.desc',
  });
  return rows.map(fromRecipeRow);
}

export async function fetchRemoteRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
  const rows = await fetchRows<RecipeIngredientRow>('recipe_ingredients', {
    filters: withWorkspaceFilter([{ column: 'recipe_id', op: 'eq', value: recipeId }]),
    order: 'id.asc',
  });
  return rows.map(fromRecipeIngredientRow);
}

export async function upsertRemoteRecipe(value: Recipe): Promise<void> {
  await upsertRows<RecipeRow>('recipes', [toRecipeRow(value)], 'workspace_id,id');
}

export async function replaceRemoteRecipeIngredients(recipeId: string, lines: RecipeIngredient[]): Promise<void> {
  await deleteRows('recipe_ingredients', withWorkspaceFilter([{ column: 'recipe_id', op: 'eq', value: recipeId }]));
  if (lines.length === 0) return;
  await upsertRows<RecipeIngredientRow>(
    'recipe_ingredients',
    lines.map(toRecipeIngredientRow),
    'workspace_id,id',
  );
}

export async function deleteRemoteRecipe(recipeId: string): Promise<void> {
  await deleteRows('recipes', withWorkspaceFilter([{ column: 'id', op: 'eq', value: recipeId }]));
  await deleteRows('recipe_ingredients', withWorkspaceFilter([{ column: 'recipe_id', op: 'eq', value: recipeId }]));
}

export async function fetchRemotePriceHistory(): Promise<PriceHistory[]> {
  const rows = await fetchRows<PriceHistoryRow>('price_history', {
    filters: withWorkspaceFilter(),
    order: 'item_name.asc',
  });
  return rows.map(fromPriceHistoryRow);
}

export async function replaceRemotePriceHistory(entries: PriceHistory[]): Promise<void> {
  await deleteRows('price_history', withWorkspaceFilter());
  if (entries.length === 0) return;
  await upsertRows<PriceHistoryRow>(
    'price_history',
    entries.map(toPriceHistoryRow),
    'workspace_id,id',
  );
}
