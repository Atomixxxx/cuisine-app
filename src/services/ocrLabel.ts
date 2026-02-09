import { blobToBase64, sanitize } from '../utils';
import { getApiKey } from './ocrKeyManager';
import {
  assertOnlineOrThrow,
  fetchWithRetry,
  GEMINI_FLASH_ENDPOINT,
  parseJsonPayload,
  reserveOcrSlot,
} from './ocrUtils';

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
  assertOnlineOrThrow('analyse etiquette');

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Cle API Gemini non configuree. Ajoutez votre cle dans les parametres.');
  }

  const releaseSlot = await reserveOcrSlot();
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
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
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
    releaseSlot();
  }
}
