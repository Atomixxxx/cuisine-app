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

function getEnvApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
}

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
  const envApiKey = getEnvApiKey();
  if (!_cachedApiKey && envApiKey) {
    _cachedApiKey = envApiKey;
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
      "totalPriceHT": 0.00
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
- Calcule totalTVA = totalTTC - totalHT si non explicite`;

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
    ? (parsed.items as Record<string, unknown>[]).map((item) => ({
        designation: sanitize(String(item.designation || '')),
        quantity: Number(item.quantity) || 1,
        unitPriceHT: Number(item.unitPriceHT) || 0,
        totalPriceHT: Number(item.totalPriceHT) || 0,
      }))
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
