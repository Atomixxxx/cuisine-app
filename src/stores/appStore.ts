import { create } from 'zustand';
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
import { createInvoiceSlice } from './invoiceSlice';
import { createProductSlice } from './productSlice';
import { createRecipeSlice } from './recipeSlice';
import { createSettingsSlice } from './settingsSlice';
import { createTaskSlice } from './taskSlice';
import { createTemperatureSlice } from './temperatureSlice';

export interface AppState {
  settings: AppSettings | null;
  equipment: Equipment[];
  darkMode: boolean;
  activeTab: string;

  loadSettings: () => Promise<void>;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  setDarkMode: (v: boolean) => void;
  setActiveTab: (tab: string) => void;

  loadEquipment: () => Promise<void>;
  addEquipment: (e: Equipment) => Promise<void>;
  updateEquipment: (e: Equipment) => Promise<void>;
  deleteEquipment: (id: string) => Promise<void>;

  addTemperatureRecord: (r: TemperatureRecord) => Promise<void>;
  getTemperatureRecords: (
    startDate?: Date,
    endDate?: Date,
    equipmentId?: string,
  ) => Promise<TemperatureRecord[]>;
  addOilChangeRecord: (r: OilChangeRecord) => Promise<void>;
  removeOilChangeRecord: (id: string) => Promise<void>;
  getOilChangeRecords: (startDate?: Date, endDate?: Date, fryerId?: string) => Promise<OilChangeRecord[]>;

  getTasks: (includeArchived?: boolean) => Promise<Task[]>;
  addTask: (t: Task) => Promise<void>;
  updateTask: (t: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  getProducts: (options?: { limit?: number; offset?: number }) => Promise<ProductTrace[]>;
  getLatestProductByBarcode: (barcode: string) => Promise<ProductTrace | null>;
  addProduct: (p: ProductTrace) => Promise<void>;
  updateProduct: (p: ProductTrace) => Promise<void>;
  markProductAsUsed: (id: string) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  getInvoices: (options?: { limit?: number; offset?: number }) => Promise<Invoice[]>;
  addInvoice: (i: Invoice) => Promise<void>;
  updateInvoice: (i: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;

  getIngredients: () => Promise<Ingredient[]>;
  addIngredient: (i: Ingredient) => Promise<void>;
  updateIngredient: (i: Ingredient) => Promise<void>;
  deleteIngredient: (id: string) => Promise<void>;

  getRecipes: () => Promise<Recipe[]>;
  getRecipeIngredients: (recipeId: string) => Promise<RecipeIngredient[]>;
  saveRecipeWithIngredients: (recipe: Recipe, lines: RecipeIngredient[]) => Promise<void>;
  deleteRecipe: (recipeId: string) => Promise<void>;

  processRecurringTasks: () => Promise<void>;

  updatePriceHistory: (invoice: Invoice) => Promise<void>;
  rebuildPriceHistory: () => Promise<void>;
  getPriceHistory: () => Promise<PriceHistory[]>;
  deletePriceHistoryItem: (id: string) => Promise<void>;
  clearAllPriceHistory: () => Promise<void>;
}

export const useAppStore = create<AppState>()((...args) => ({
  ...createSettingsSlice(...args),
  ...createTemperatureSlice(...args),
  ...createTaskSlice(...args),
  ...createProductSlice(...args),
  ...createInvoiceSlice(...args),
  ...createRecipeSlice(...args),
}));
