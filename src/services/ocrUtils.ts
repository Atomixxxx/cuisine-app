export const GEMINI_FLASH_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

let ocrAnalyzeLock = false;
let lastOcrAnalyzeAt = 0;
const OCR_MIN_INTERVAL_MS = 1200;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertOnlineOrThrow(actionLabel: string): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(`Mode hors ligne: ${actionLabel} indisponible sans connexion internet.`);
  }
}

export async function fetchWithRetry(
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

export async function reserveOcrSlot(): Promise<() => void> {
  if (ocrAnalyzeLock) {
    throw new Error('Une analyse OCR est deja en cours. Patientez quelques secondes.');
  }

  ocrAnalyzeLock = true;
  const now = Date.now();
  const waitMs = OCR_MIN_INTERVAL_MS - (now - lastOcrAnalyzeAt);
  if (waitMs > 0) {
    await wait(waitMs);
  }
  lastOcrAnalyzeAt = Date.now();

  return () => {
    ocrAnalyzeLock = false;
  };
}

export function parseJsonPayload(textContent: string): Record<string, unknown> {
  const jsonStr = textContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Impossible de lire la reponse de Gemini. Reessayez.");
    }
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  }
}
