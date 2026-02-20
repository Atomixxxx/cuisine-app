import type {
  AppSettings,
  Equipment,
  Ingredient,
  Invoice,
  Order,
  PriceHistory,
  ProductTrace,
  Recipe,
  TemperatureRecord,
} from '../types';
import { getApiKey } from './ocr';

export type AssistantActionType = 'temperature_batch' | 'info' | 'chat';

export interface AssistantResponse {
  action: AssistantActionType;
  reply: string;
  createdRecords?: number;
}

interface TemperatureCommand {
  target: 'all' | Equipment['type'];
  temperature: number;
}

interface AssistantDependencies {
  equipment: Equipment[];
  addTemperatureRecord: (record: TemperatureRecord) => Promise<void>;
  getTemperatureRecords: (startDate?: Date, endDate?: Date, equipmentId?: string) => Promise<TemperatureRecord[]>;
  invoices?: Invoice[];
  orders?: Order[];
  ingredients?: Ingredient[];
  priceHistory?: PriceHistory[];
  recipes?: Recipe[];
  products?: ProductTrace[];
  settings?: AppSettings | null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectTemperatureValue(input: string): number | null {
  const normalized = normalizeText(input);
  const byDegree = normalized.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°|degre|degres|c)\b/i);
  if (byDegree?.[1]) return Number.parseFloat(byDegree[1].replace(',', '.'));

  const byPreposition = normalized.match(/\ba\s*(-?\d+(?:[.,]\d+)?)/i);
  if (byPreposition?.[1]) return Number.parseFloat(byPreposition[1].replace(',', '.'));

  return null;
}

function detectTemperatureTarget(normalizedInput: string): TemperatureCommand['target'] {
  if (normalizedInput.includes('chambre froide')) return 'cold_room';
  if (normalizedInput.includes('congel')) return 'freezer';
  if (normalizedInput.includes('frigo') || normalizedInput.includes('refrigerateur')) return 'fridge';
  return 'all';
}

function parseTemperatureCommand(input: string): TemperatureCommand | null {
  const normalized = normalizeText(input);
  const hasSaveIntent = /(enregistre|enregistrer|saisie|saisis|ajoute|ajouter|renseigne|note|noter)/.test(normalized);
  if (!hasSaveIntent) return null;

  const value = detectTemperatureValue(input);
  if (value === null || !Number.isFinite(value)) return null;

  return {
    target: detectTemperatureTarget(normalized),
    temperature: value,
  };
}

function filterEquipmentByTarget(equipment: Equipment[], target: TemperatureCommand['target']): Equipment[] {
  if (target === 'all') return equipment;
  return equipment.filter((item) => item.type === target);
}

async function executeTemperatureBatch(
  command: TemperatureCommand,
  deps: AssistantDependencies,
): Promise<AssistantResponse> {
  const targets = filterEquipmentByTarget(deps.equipment, command.target);
  if (!targets.length) {
    return {
      action: 'temperature_batch',
      reply: 'Je ne trouve aucun equipement correspondant a cette demande.',
      createdRecords: 0,
    };
  }

  const now = new Date();
  const records: TemperatureRecord[] = targets.map((eq) => ({
    id: crypto.randomUUID(),
    equipmentId: eq.id,
    temperature: command.temperature,
    timestamp: now,
    isCompliant: command.temperature >= eq.minTemp && command.temperature <= eq.maxTemp,
  }));

  await Promise.all(records.map((record) => deps.addTemperatureRecord(record)));
  const compliantCount = records.filter((record) => record.isCompliant).length;

  return {
    action: 'temperature_batch',
    createdRecords: records.length,
    reply:
      `Saisie enregistree pour ${records.length} equipement(s) a ${command.temperature} degres. ` +
      `${compliantCount}/${records.length} conforme(s).`,
  };
}

function handleCountIntent(input: string, equipment: Equipment[]): AssistantResponse | null {
  const normalized = normalizeText(input);
  if (!normalized.includes('combien')) return null;

  if (normalized.includes('frigo') || normalized.includes('refrigerateur')) {
    const count = equipment.filter((eq) => eq.type === 'fridge').length;
    return { action: 'info', reply: `Tu as ${count} frigo(s) configure(s).` };
  }
  if (normalized.includes('congel')) {
    const count = equipment.filter((eq) => eq.type === 'freezer').length;
    return { action: 'info', reply: `Tu as ${count} congelateur(s) configure(s).` };
  }
  if (normalized.includes('chambre froide')) {
    const count = equipment.filter((eq) => eq.type === 'cold_room').length;
    return { action: 'info', reply: `Tu as ${count} chambre(s) froide(s) configuree(s).` };
  }
  if (normalized.includes('equipement')) {
    return { action: 'info', reply: `Tu as ${equipment.length} equipement(s) au total.` };
  }
  return null;
}

async function handleTodayStatusIntent(input: string, deps: AssistantDependencies): Promise<AssistantResponse | null> {
  const normalized = normalizeText(input);
  if (!/(aujourd'hui|aujourdhui|dernier|derniers|releve|releves|statut)/.test(normalized)) return null;
  if (!/(temperature|frigo|congel|chambre froide|equipement)/.test(normalized)) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const records = await deps.getTemperatureRecords(start);
  if (!records.length) {
    return { action: 'info', reply: "Aucun releve de temperature enregistre aujourd'hui." };
  }

  const nonCompliant = records.filter((record) => !record.isCompliant).length;
  return {
    action: 'info',
    reply:
      `Aujourd'hui: ${records.length} releve(s) enregistre(s), ` +
      `${nonCompliant} non conforme(s).`,
  };
}

function helpMessage(): AssistantResponse {
  return {
    action: 'info',
    reply: 'Je peux repondre a tes questions et executer des actions de saisie temperature.',
  };
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateLabel(value: Date | string | number | null | undefined): string {
  const parsed = toDate(value);
  if (!parsed) return 'n/a';
  return parsed.toLocaleDateString('fr-FR');
}

function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(2)} EUR`;
}

function takeLines(lines: string[], limit: number): string {
  const visible = lines.slice(0, limit);
  const hidden = lines.length - visible.length;
  return hidden > 0
    ? `${visible.join('\n')}\n- ... ${hidden} element(s) supplementaire(s)`
    : visible.join('\n');
}

function summarizeEquipment(equipment: Equipment[]): string {
  if (!equipment.length) return 'Aucun equipement configure.';
  const lines = equipment.map((eq) =>
    `- ${eq.name} (${eq.type}) plage ${eq.minTemp} a ${eq.maxTemp} degres`,
  );
  return `Total: ${equipment.length}\n${takeLines(lines, 20)}`;
}

function summarizeIngredients(ingredients: Ingredient[]): string {
  if (!ingredients.length) return 'Aucun ingredient.';
  const lines = ingredients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => `- ${item.name} | unite ${item.unit} | prix fiche ${formatMoney(item.unitPrice)}`);
  return `Total: ${ingredients.length}\n${takeLines(lines, 30)}`;
}

function getLatestPrice(item: PriceHistory): { price: number; date: Date | null } {
  let latestDate: Date | null = null;
  let latestPrice = item.averagePrice;

  for (const point of item.prices) {
    const pointDate = toDate(point.date);
    if (!pointDate) continue;
    if (!latestDate || pointDate.getTime() > latestDate.getTime()) {
      latestDate = pointDate;
      latestPrice = point.price;
    }
  }

  return { price: latestPrice, date: latestDate };
}

function summarizePriceHistory(priceHistory: PriceHistory[]): string {
  if (!priceHistory.length) return 'Aucune entree de cadencier.';
  const lines = priceHistory
    .slice()
    .sort((a, b) => a.itemName.localeCompare(b.itemName))
    .map((item) => {
      const latest = getLatestPrice(item);
      const latestLabel = latest.date
        ? `${formatMoney(latest.price)} au ${formatDateLabel(latest.date)}`
        : `${formatMoney(latest.price)} (date n/a)`;
      const supplier = item.supplier || 'Inconnu';
      return `- ${item.itemName} | ${supplier} | dernier ${latestLabel} | min ${formatMoney(item.minPrice)} | max ${formatMoney(item.maxPrice)} | moyenne ${formatMoney(item.averagePrice)}`;
    });

  return `Total: ${priceHistory.length}\n${takeLines(lines, 35)}`;
}

function summarizeInvoices(invoices: Invoice[]): string {
  if (!invoices.length) return 'Aucune facture.';

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  let totalAmount = 0;
  let monthCount = 0;
  let monthAmount = 0;
  const supplierCount = new Map<string, number>();

  for (const invoice of invoices) {
    const amount = Number.isFinite(invoice.totalTTC) ? invoice.totalTTC : 0;
    totalAmount += amount;

    const supplier = invoice.supplier?.trim() || 'Inconnu';
    supplierCount.set(supplier, (supplierCount.get(supplier) ?? 0) + 1);

    const invoiceDate = toDate(invoice.invoiceDate);
    if (invoiceDate && invoiceDate >= monthStart && invoiceDate < nextMonthStart) {
      monthCount += 1;
      monthAmount += amount;
    }
  }

  const topSuppliers = Array.from(supplierCount.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([supplier, count]) => `${supplier} (${count})`)
    .join(', ');

  const recentLines = invoices
    .slice()
    .sort((a, b) => {
      const aTime = toDate(a.invoiceDate)?.getTime() ?? 0;
      const bTime = toDate(b.invoiceDate)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map((invoice) => {
      const supplier = invoice.supplier?.trim() || 'Inconnu';
      return `- ${formatDateLabel(invoice.invoiceDate)} | ${supplier} | ${formatMoney(invoice.totalTTC)}`;
    });

  return [
    `Total: ${invoices.length} facture(s), montant cumule ${formatMoney(totalAmount)}`,
    `Mois en cours: ${monthCount} facture(s), ${formatMoney(monthAmount)}`,
    `Top fournisseurs: ${topSuppliers || 'n/a'}`,
    takeLines(recentLines, 25),
  ].join('\n');
}

function summarizeOrders(orders: Order[]): string {
  if (!orders.length) return 'Aucune commande.';

  const statusCount = new Map<Order['status'], number>();
  for (const order of orders) {
    statusCount.set(order.status, (statusCount.get(order.status) ?? 0) + 1);
  }

  const statusSummary = Array.from(statusCount.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');

  const recentLines = orders
    .slice()
    .sort((a, b) => {
      const aTime = toDate(a.orderDate)?.getTime() ?? 0;
      const bTime = toDate(b.orderDate)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map((order) => `- ${order.orderNumber} | ${order.supplier} | ${order.status} | ${formatMoney(order.totalHT)} HT | ${formatDateLabel(order.orderDate)}`);

  return [
    `Total: ${orders.length} commande(s)`,
    `Par statut: ${statusSummary || 'n/a'}`,
    takeLines(recentLines, 20),
  ].join('\n');
}

function summarizeProducts(products: ProductTrace[]): string {
  if (!products.length) return 'Aucun produit de tracabilite.';

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);

  let active = 0;
  let used = 0;
  let expiringSoon = 0;
  let expired = 0;

  for (const product of products) {
    if (product.status === 'active') active += 1;
    if (product.status === 'used') used += 1;

    const expirationDate = toDate(product.expirationDate);
    if (!expirationDate) continue;

    if (expirationDate < now) {
      expired += 1;
      continue;
    }

    if (expirationDate <= soon) {
      expiringSoon += 1;
    }
  }

  const soonLines = products
    .slice()
    .filter((product) => product.status === 'active')
    .sort((a, b) => {
      const aTime = toDate(a.expirationDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = toDate(b.expirationDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .map((product) => `- ${product.productName} | ${product.supplier} | lot ${product.lotNumber} | exp ${formatDateLabel(product.expirationDate)}`);

  return [
    `Total: ${products.length} produit(s)`,
    `Actifs: ${active}, utilises: ${used}, expires: ${expired}, expiration <= 7 jours: ${expiringSoon}`,
    takeLines(soonLines, 20),
  ].join('\n');
}

function summarizeRecipes(recipes: Recipe[]): string {
  if (!recipes.length) return 'Aucune recette.';
  const titles = recipes
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((recipe) => `- ${recipe.title}`);
  return `Total: ${recipes.length}\n${takeLines(titles, 30)}`;
}

function summarizeSettings(settings: AppSettings | null | undefined): string {
  if (!settings) return 'Aucun parametre charge.';
  return [
    `Etablissement: ${settings.establishmentName || 'inconnu'}`,
    `Alerte variation prix: ${settings.priceAlertThreshold}%`,
  ].join('\n');
}

async function askGeminiAssistant(question: string, deps: AssistantDependencies): Promise<string | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;

  const equipmentSummary = summarizeEquipment(deps.equipment);
  const ingredientsSummary = summarizeIngredients(deps.ingredients ?? []);
  const priceHistorySummary = summarizePriceHistory(deps.priceHistory ?? []);
  const invoicesSummary = summarizeInvoices(deps.invoices ?? []);
  const ordersSummary = summarizeOrders(deps.orders ?? []);
  const productsSummary = summarizeProducts(deps.products ?? []);
  const recipesSummary = summarizeRecipes(deps.recipes ?? []);
  const settingsSummary = summarizeSettings(deps.settings);

  const prompt = [
    'Tu es un assistant cuisine HACCP expert.',
    'Reponds en francais, de maniere concise, claire et actionnable.',
    'Utilise uniquement le contexte fourni ci-dessous et n invente pas de donnees.',
    'Si la reponse n est pas dans le contexte, indique-le explicitement.',
    '',
    'Contexte application:',
    settingsSummary,
    '',
    'Equipements:',
    equipmentSummary,
    '',
    'Ingredients:',
    ingredientsSummary,
    '',
    'Cadencier prix:',
    priceHistorySummary,
    '',
    'Factures:',
    invoicesSummary,
    '',
    'Commandes:',
    ordersSummary,
    '',
    'Produits tracabilite:',
    productsSummary,
    '',
    'Recettes:',
    recipesSummary,
    '',
    `Question utilisateur: ${question}`,
  ].join('\n');

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

export async function processAssistantMessage(
  input: string,
  deps: AssistantDependencies,
): Promise<AssistantResponse> {
  const trimmed = input.trim();
  if (!trimmed) return helpMessage();

  const normalized = normalizeText(trimmed);
  if (/(aide|help|que peux tu|que sais tu faire|commandes)/.test(normalized)) {
    return helpMessage();
  }

  const command = parseTemperatureCommand(trimmed);
  if (command) {
    return executeTemperatureBatch(command, deps);
  }

  const countResponse = handleCountIntent(trimmed, deps.equipment);
  if (countResponse) return countResponse;

  const todayResponse = await handleTodayStatusIntent(trimmed, deps);
  if (todayResponse) return todayResponse;

  const aiReply = await askGeminiAssistant(trimmed, deps);
  if (aiReply) {
    return { action: 'chat', reply: aiReply };
  }

  return {
    action: 'chat',
    reply: "Je n'ai pas compris la demande. Reformule simplement ce que tu veux faire.",
  };
}
