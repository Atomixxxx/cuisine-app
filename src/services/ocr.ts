import type { InvoiceItem } from '../types';
import { sanitize } from '../utils';
import { db } from './db';
import { STORAGE_KEYS } from '../constants/storageKeys';

export interface OCRResult {
  text: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  items: InvoiceItem[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
}

// API key is stored in IndexedDB settings table for persistence
let _cachedApiKey: string | null = null;
let _ocrAnalyzeLock = false;
let _lastOcrAnalyzeAt = 0;
const OCR_MIN_INTERVAL_MS = 1200;

export async function getApiKey(): Promise<string> {
  if (_cachedApiKey !== null) return _cachedApiKey;
  const settings = await db.settings.get('default');
  _cachedApiKey = settings?.geminiApiKey ?? '';
  // Migrate from localStorage if present
  const legacyKey = localStorage.getItem(STORAGE_KEYS.geminiApiKeyLegacy);
  if (legacyKey && !_cachedApiKey) {
    _cachedApiKey = legacyKey;
    await db.settings.update('default', { geminiApiKey: legacyKey });
    localStorage.removeItem(STORAGE_KEYS.geminiApiKeyLegacy);
  }
  return _cachedApiKey;
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  _cachedApiKey = trimmed;
  await db.settings.update('default', { geminiApiKey: trimmed });
}

export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key.length > 0;
}

export function resetOcrApiKeyCache(): void {
  _cachedApiKey = null;
}

/**
 * Convert a Blob to a base64-encoded string (without the data URL prefix).
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let attempt = 0;
  let delayMs = 700;
  let lastNetworkError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, init);
      const retryableStatus =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!retryableStatus || attempt === maxRetries) {
        return response;
      }
    } catch (error) {
      lastNetworkError = error;
      if (attempt === maxRetries) {
        throw error;
      }
    }

    await wait(delayMs);
    delayMs *= 2;
    attempt += 1;
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error('Echec de connexion au service OCR');
}

async function reserveOcrSlot(): Promise<void> {
  if (_ocrAnalyzeLock) {
    throw new Error('Une analyse OCR est deja en cours. Patientez quelques secondes.');
  }
  _ocrAnalyzeLock = true;
  const now = Date.now();
  const waitMs = OCR_MIN_INTERVAL_MS - (now - _lastOcrAnalyzeAt);
  if (waitMs > 0) {
    await wait(waitMs);
  }
  _lastOcrAnalyzeAt = Date.now();
}

/**
 * Analyze invoice images using Google Gemini Flash vision API.
 * Sends all page images in a single request and returns structured data.
 */
export async function analyzeInvoiceImages(
  imageBlobs: Blob[],
  onProgress?: (progress: number) => void,
): Promise<OCRResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Clé API Gemini non configurée. Ajoutez votre clé dans les paramètres.');
  }

  await reserveOcrSlot();
  try {
    onProgress?.(10);

  // Convert all images to base64 parts
  const imageParts = await Promise.all(
    imageBlobs.map(async (blob) => {
      const base64 = await blobToBase64(blob);
      const mimeType = blob.type || 'image/jpeg';
      return {
        inline_data: {
          mime_type: mimeType,
          data: base64,
        },
      };
    }),
  );

  onProgress?.(30);

  const prompt = `Tu es un expert en lecture de factures fournisseur pour la restauration.
Analyse cette facture (${imageBlobs.length} page${imageBlobs.length > 1 ? 's' : ''}) et extrais les informations suivantes au format JSON strict.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte avant ou après.

Format attendu:
{
  "supplier": "Nom du fournisseur (ex: GINEYS, TRANSGOURMET, METRO...)",
  "invoiceNumber": "Numéro de facture ou bon de livraison",
  "invoiceDate": "Date au format YYYY-MM-DD",
  "items": [
    {
      "designation": "Nom du produit (nettoyé, lisible)",
      "quantity": 1,
      "unitPriceHT": 0.00,
      "totalPriceHT": 0.00,
      "conditioningQuantity": 1,
      "conditioningUnit": "kg"
    }
  ],
  "totalHT": 0.00,
  "totalTVA": 0.00,
  "totalTTC": 0.00,
  "rawText": "Texte brut de la facture (résumé des infos clés)"
}

Règles:
- Les prix sont en euros, hors taxes (HT) sauf indication contraire
- Si un champ est introuvable, utilise une valeur vide ("") ou 0
- Pour les items, extrais le nom du produit de façon lisible et propre
- Pour le fournisseur, c'est l'entreprise qui ÉMET la facture (pas le client)
- Pour la date, convertis au format YYYY-MM-DD
- Calcule totalTVA = totalTTC - totalHT si non explicite
- conditioningQuantity = nombre d'unites dans le conditionnement. Ex: "carton 90 oeufs" → conditioningQuantity=90, conditioningUnit="unite". "Sac 25kg farine" → conditioningQuantity=25, conditioningUnit="kg". Si le produit est vendu a l'unite simple ou au poids, mettre 1.
- conditioningUnit parmi: kg, g, l, ml, unite`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          ...imageParts,
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  onProgress?.(40);

  const response = await fetchWithRetry(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
  );

  onProgress?.(80);

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 400 && err.includes('API_KEY')) {
      throw new Error('Clé API Gemini invalide. Vérifiez votre clé dans les paramètres.');
    }
    if (response.status === 429) {
      throw new Error('Limite de requêtes atteinte. Réessayez dans quelques secondes.');
    }
    throw new Error(`Erreur Gemini (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();

  const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error("Gemini n'a pas retourné de réponse. Réessayez.");
  }

  onProgress?.(90);

  // Parse the JSON response — strip any markdown fencing if present
  const jsonStr = textContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to extract JSON from the response if it has extra text
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Impossible de lire la réponse de Gemini. Réessayez.");
    }
  }

  onProgress?.(100);

  // Map to OCRResult — sanitize all string fields from the AI response
  const items: InvoiceItem[] = Array.isArray(parsed.items)
    ? (parsed.items as Record<string, unknown>[]).map((item) => {
        const cq = Number(item.conditioningQuantity) || 0;
        const cuRaw = String(item.conditioningUnit || '').toLowerCase().trim();
        const validUnits = ['kg', 'g', 'l', 'ml', 'unite'];
        return {
          designation: sanitize(String(item.designation || '')),
          quantity: Number(item.quantity) || 1,
          unitPriceHT: Number(item.unitPriceHT) || 0,
          totalPriceHT: Number(item.totalPriceHT) || 0,
          conditioningQuantity: cq > 1 ? cq : undefined,
          conditioningUnit: cq > 1 && validUnits.includes(cuRaw) ? cuRaw as InvoiceItem['conditioningUnit'] : undefined,
        };
      })
    : [];

    return {
      text: sanitize(String(parsed.rawText || parsed.text || '')),
      supplier: sanitize(String(parsed.supplier || '')),
      invoiceNumber: sanitize(String(parsed.invoiceNumber || '')),
      invoiceDate: String(parsed.invoiceDate || new Date().toISOString().split('T')[0]),
      items,
      totalHT: Number(parsed.totalHT) || 0,
      totalTVA: Number(parsed.totalTVA) || 0,
      totalTTC: Number(parsed.totalTTC) || 0,
    };
  } finally {
    _ocrAnalyzeLock = false;
  }
}

/* ── Label / traceability OCR ── */

export interface LabelOCRResult {
  productName: string;
  lotNumber: string;
  expirationDate: string;
  packagingDate: string;
  estampilleSanitaire: string;
  weight: string;
  category: string;
  rawText: string;
}

const LABEL_PROMPT = `Tu es un expert en lecture d'etiquettes alimentaires francaises (viande, volaille, poisson, charcuterie, etc.).
Analyse cette photo d'etiquette et extrais les informations suivantes au format JSON strict.

Reponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte avant ou apres.

Format attendu:
{
  "productName": "Nom du produit (ex: 6 ESCALOPES DE DINDE)",
  "lotNumber": "Numero de lot (champ 'Lot')",
  "expirationDate": "Date limite de consommation au format YYYY-MM-DD (depuis 'A consommer jusqu'au' ou 'DLC' ou 'DDM')",
  "packagingDate": "Date d'emballage au format YYYY-MM-DD (depuis 'Emballe le' ou 'Conditionne le')",
  "estampilleSanitaire": "Estampille sanitaire ovale (ex: FR 61.096.020 CE)",
  "weight": "Poids net (ex: 0,950 kg)",
  "category": "Categorie parmi: Viande, Poisson, Legumes, Fruits, Produits laitiers, Epicerie seche, Surgeles, Boissons, Autre",
  "rawText": "Resume du texte brut visible sur l'etiquette"
}

Regles:
- Convertis toutes les dates au format YYYY-MM-DD (attention: les dates francaises sont JJ.MM.AA ou JJ/MM/AAAA)
- Pour les annees a 2 chiffres, considere 00-79 comme 2000-2079 et 80-99 comme 1980-1999
- Si un champ est introuvable, utilise une chaine vide ""
- Pour la categorie, deduis-la du type de produit (ex: dinde/poulet/boeuf -> Viande, saumon/cabillaud -> Poisson)
- L'estampille sanitaire est generalement dans un ovale avec FR ... CE`;

export async function analyzeLabelImage(
  imageBlob: Blob,
  onProgress?: (progress: number) => void,
): Promise<LabelOCRResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Cle API Gemini non configuree. Ajoutez votre cle dans les parametres.');
  }

  await reserveOcrSlot();
  try {
    onProgress?.(10);

    const base64 = await blobToBase64(imageBlob);
    const mimeType = imageBlob.type || 'image/jpeg';

    onProgress?.(30);

    const body = {
      contents: [
        {
          parts: [
            { text: LABEL_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    onProgress?.(40);

    const response = await fetchWithRetry(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
      },
    );

    onProgress?.(80);

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 400 && err.includes('API_KEY')) {
        throw new Error('Cle API Gemini invalide. Verifiez votre cle dans les parametres.');
      }
      if (response.status === 429) {
        throw new Error('Limite de requetes atteinte. Reessayez dans quelques secondes.');
      }
      throw new Error(`Erreur Gemini (${response.status}): ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      throw new Error("Gemini n'a pas retourne de reponse. Reessayez.");
    }

    onProgress?.(90);

    const jsonStr = textContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Impossible de lire la reponse de Gemini. Reessayez.");
      }
    }

    onProgress?.(100);

    return {
      productName: sanitize(String(parsed.productName || '')),
      lotNumber: sanitize(String(parsed.lotNumber || '')),
      expirationDate: String(parsed.expirationDate || ''),
      packagingDate: String(parsed.packagingDate || ''),
      estampilleSanitaire: sanitize(String(parsed.estampilleSanitaire || '')),
      weight: sanitize(String(parsed.weight || '')),
      category: sanitize(String(parsed.category || '')),
      rawText: sanitize(String(parsed.rawText || '')),
    };
  } finally {
    _ocrAnalyzeLock = false;
  }
}
