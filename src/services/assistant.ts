import type { Equipment, TemperatureRecord } from '../types';
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

async function askGeminiAssistant(question: string, equipment: Equipment[]): Promise<string | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;

  const equipmentSummary =
    equipment.length === 0
      ? 'Aucun equipement configure.'
      : equipment
          .map((eq) => `- ${eq.name} (${eq.type}) plage ${eq.minTemp} a ${eq.maxTemp} degres`)
          .join('\n');

  const prompt = `Tu es un assistant cuisine HACCP. Reponds en francais, de maniere concise et actionnable.
Contexte equipements:
${equipmentSummary}

Si la demande implique une action de saisie, dis clairement de passer par la commande explicite.
Question: ${question}`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
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

  const aiReply = await askGeminiAssistant(trimmed, deps.equipment);
  if (aiReply) {
    return { action: 'chat', reply: aiReply };
  }

  return {
    action: 'chat',
    reply: "Je n'ai pas compris la demande. Reformule simplement ce que tu veux faire.",
  };
}
