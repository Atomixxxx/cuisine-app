import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { analyzeInvoiceImages, getApiKey, resetOcrApiKeyCache } from './ocr';

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  localStorage.clear();
  await db.settings.clear();
  resetOcrApiKeyCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ocr service', () => {
  it('returns empty string when no stored key exists', async () => {
    resetOcrApiKeyCache();

    const key = await getApiKey();

    expect(key).toBe('');
  });

  it('retries transient API failure and succeeds', async () => {
    await db.settings.put({
      id: 'default',
      establishmentName: 'Test',
      darkMode: false,
      onboardingDone: true,
      priceAlertThreshold: 10,
      geminiApiKey: 'db-api-key',
    });
    resetOcrApiKeyCache();

    const apiPayload = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  supplier: 'Pomona',
                  invoiceNumber: 'INV-1',
                  invoiceDate: '2026-02-07',
                  items: [
                    { designation: 'Tomates', quantity: 2, unitPriceHT: 1.5, totalPriceHT: 3 },
                  ],
                  totalHT: 3,
                  totalTVA: 0.6,
                  totalTTC: 3.6,
                  rawText: 'test',
                }),
              },
            ],
          },
        },
      ],
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(apiPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const imageBlob = {
      type: 'image/jpeg',
      arrayBuffer: async () => new TextEncoder().encode('x').buffer,
    } as unknown as Blob;

    vi.useFakeTimers();
    const promise = analyzeInvoiceImages([imageBlob]);
    await vi.runAllTimersAsync();
    const result = await promise;

    const firstHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers as HeadersInit);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(firstHeaders.get('x-goog-api-key')).toBe('db-api-key');
    expect(result.supplier).toBe('Pomona');
    expect(result.items).toHaveLength(1);
  });
});
