import type { InvoiceItem } from '../types';
import { blobToBase64, sanitize } from '../utils';
import { getApiKey } from './ocrKeyManager';
import {
  assertOnlineOrThrow,
  fetchWithRetry,
  GEMINI_FLASH_ENDPOINT,
  parseJsonPayload,
  reserveOcrSlot,
} from './ocrUtils';

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

export async function analyzeInvoiceImages(
  imageBlobs: Blob[],
  onProgress?: (progress: number) => void,
): Promise<OCRResult> {
  assertOnlineOrThrow('analyse OCR');

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Cle API Gemini non configuree. Ajoutez votre cle dans les parametres.');
  }

  const releaseSlot = await reserveOcrSlot();
  try {
    onProgress?.(10);

    const imageParts = await Promise.all(
      imageBlobs.map(async (blob) => ({
        inline_data: {
          mime_type: blob.type || 'image/jpeg',
          data: await blobToBase64(blob),
        },
      })),
    );

    onProgress?.(30);

    const prompt = `Tu es un expert en lecture de factures fournisseur pour la restauration.
Analyse cette facture (${imageBlobs.length} page${imageBlobs.length > 1 ? 's' : ''}) et extrais les informations suivantes au format JSON strict.

Reponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte avant ou apres.

Format attendu:
{
  "supplier": "Nom du fournisseur (ex: GINEYS, TRANSGOURMET, METRO...)",
  "invoiceNumber": "Numero de facture ou bon de livraison",
  "invoiceDate": "Date au format YYYY-MM-DD",
  "items": [
    {
      "designation": "Nom du produit (nettoye, lisible)",
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
  "rawText": "Texte brut de la facture (resume des infos cles)"
}

Regles:
- Les prix sont en euros, hors taxes (HT) sauf indication contraire
- Si un champ est introuvable, utilise une valeur vide ("") ou 0
- Pour les items, extrais le nom du produit de facon lisible et propre
- Pour le fournisseur, c'est l'entreprise qui EMET la facture (pas le client)
- Pour la date, convertis au format YYYY-MM-DD
- Calcule totalTVA = totalTTC - totalHT si non explicite
- conditioningQuantity = nombre d'unites dans le conditionnement. Ex: "carton 90 oeufs" -> conditioningQuantity=90, conditioningUnit="unite". "Sac 25kg farine" -> conditioningQuantity=25, conditioningUnit="kg". Si le produit est vendu a l'unite simple ou au poids, mettre 1.
- conditioningUnit parmi: kg, g, l, ml, unite`;

    const body = {
      contents: [{ parts: [{ text: prompt }, ...imageParts] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    };

    onProgress?.(40);

    const response = await fetchWithRetry(GEMINI_FLASH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

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
    const parsed = parseJsonPayload(String(textContent));
    onProgress?.(100);

    const items: InvoiceItem[] = Array.isArray(parsed.items)
      ? (parsed.items as Record<string, unknown>[]).map((item) => {
          const conditioningQuantity = Number(item.conditioningQuantity) || 0;
          const conditioningUnitRaw = String(item.conditioningUnit || '').toLowerCase().trim();
          const validUnits = ['kg', 'g', 'l', 'ml', 'unite'];
          return {
            designation: sanitize(String(item.designation || '')),
            quantity: Number(item.quantity) || 1,
            unitPriceHT: Number(item.unitPriceHT) || 0,
            totalPriceHT: Number(item.totalPriceHT) || 0,
            conditioningQuantity: conditioningQuantity > 1 ? conditioningQuantity : undefined,
            conditioningUnit:
              conditioningQuantity > 1 && validUnits.includes(conditioningUnitRaw)
                ? (conditioningUnitRaw as InvoiceItem['conditioningUnit'])
                : undefined,
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
    releaseSlot();
  }
}
