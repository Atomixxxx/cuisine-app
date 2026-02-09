export interface Equipment {
  id: string;
  name: string;
  type: 'fridge' | 'freezer' | 'cold_room';
  minTemp: number;
  maxTemp: number;
  order: number;
}

export interface TemperatureRecord {
  id: string;
  equipmentId: string;
  temperature: number;
  timestamp: Date;
  isCompliant: boolean;
  signature?: string;
}

export interface OilChangeRecord {
  id: string;
  fryerId: string;
  changedAt: Date;
  action: 'changed';
  operator?: string;
}

export interface ProductTrace {
  id: string;
  barcode?: string;
  photo?: Blob;
  photoUrl?: string;
  productName: string;
  supplier: string;
  lotNumber: string;
  receptionDate: Date;
  expirationDate: Date;
  category: string;
  allergens?: string[];
  scannedAt: Date;
}

export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskCategory = 'entrees' | 'plats' | 'desserts' | 'mise_en_place' | 'nettoyage' | 'commandes' | 'autre';
export type RecurringType = 'daily' | 'weekly' | null;

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  completed: boolean;
  estimatedTime?: number;
  notes?: string;
  recurring: RecurringType;
  createdAt: Date;
  completedAt?: Date;
  archived: boolean;
  order: number;
}

export interface Invoice {
  id: string;
  images: Blob[];
  imageUrls?: string[];
  supplier: string;
  invoiceNumber: string;
  invoiceDate: Date;
  items: InvoiceItem[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  ocrText: string;
  tags: string[];
  scannedAt: Date;
}

export interface InvoiceItem {
  designation: string;
  quantity: number;
  unitPriceHT: number;
  totalPriceHT: number;
  conditioningQuantity?: number;
  conditioningUnit?: IngredientUnit;
}

export interface PriceHistory {
  id: string;
  itemName: string;
  supplier: string;
  prices: { date: Date; price: number }[];
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
}

export interface AppSettings {
  id: string;
  establishmentName: string;
  darkMode: boolean;
  onboardingDone: boolean;
  priceAlertThreshold: number;
  geminiApiKey?: string;
}

export type IngredientUnit = 'kg' | 'g' | 'l' | 'ml' | 'unite';
export type RecipeUnit = IngredientUnit;

export interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  unitPrice: number;
  conditioningQuantity?: number;
  supplierId?: string;
}

export interface Recipe {
  id: string;
  title: string;
  portions: number;
  salePriceHT: number;
  createdAt: Date;
  updatedAt: Date;
  allergens?: string[];
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: RecipeUnit;
}

export interface RecipeCostSummary {
  totalCost: number;
  grossMargin: number;
  foodCostRate: number;
  warningLevel: 'ok' | 'warning' | 'danger';
}

export interface SupplierProductMapping {
  id: string;
  supplierId: string;
  supplierSku?: string;
  supplierLabelNormalized: string;
  templateRecipeId: string;
  quantityRatio: number;
  confidence: number;
}

export interface SupplierLineInput {
  supplierId?: string;
  supplierSku?: string;
  label: string;
}

export interface SupplierLineResolution {
  templateRecipeId: string;
  quantityRatio: number;
  confidence: number;
  source: 'exact' | 'fuzzy';
}

export const CATEGORIES: Record<TaskCategory, string> = {
  entrees: 'Entrées',
  plats: 'Plats',
  desserts: 'Desserts',
  mise_en_place: 'Mise en place',
  nettoyage: 'Nettoyage',
  commandes: 'Commandes',
  autre: 'Autre',
};

export const PRODUCT_CATEGORIES = [
  'Viande',
  'Poisson',
  'Légumes',
  'Fruits',
  'Produits laitiers',
  'Épicerie sèche',
  'Surgelés',
  'Boissons',
  'Autre',
];

export const EU_ALLERGENS = [
  'Gluten',
  'Crustaces',
  'Oeufs',
  'Poissons',
  'Arachides',
  'Soja',
  'Lait',
  'Fruits a coque',
  'Celeri',
  'Moutarde',
  'Graines de sesame',
  'Sulfites',
  'Lupin',
  'Mollusques',
];

export const EQUIPMENT_TYPES: Record<Equipment['type'], string> = {
  fridge: 'Réfrigérateur',
  freezer: 'Congélateur',
  cold_room: 'Chambre froide',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: '#EF4444',
  normal: '#F59E0B',
  low: '#3B82F6',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Haute',
  normal: 'Normale',
  low: 'Basse',
};
