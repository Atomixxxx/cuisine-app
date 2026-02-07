import { describe, expect, it, vi } from 'vitest';
import type { Equipment, TemperatureRecord } from '../types';
import { processAssistantMessage } from './assistant';

const equipment: Equipment[] = [
  { id: 'f1', name: 'Frigo 1', type: 'fridge', minTemp: 0, maxTemp: 4, order: 0 },
  { id: 'f2', name: 'Frigo 2', type: 'fridge', minTemp: 0, maxTemp: 4, order: 1 },
  { id: 'c1', name: 'Congelateur', type: 'freezer', minTemp: -25, maxTemp: -18, order: 2 },
];

describe('assistant service', () => {
  it('registers batch temperature for fridges from natural language command', async () => {
    const addTemperatureRecord = vi.fn(async (_record: TemperatureRecord) => undefined);
    const getTemperatureRecords = vi.fn(async () => []);

    const response = await processAssistantMessage('Tous les frigos sont a 2 degres, enregistre la saisie', {
      equipment,
      addTemperatureRecord,
      getTemperatureRecords,
    });

    expect(response.action).toBe('temperature_batch');
    expect(response.createdRecords).toBe(2);
    expect(addTemperatureRecord).toHaveBeenCalledTimes(2);
  });

  it('answers equipment count question without write action', async () => {
    const addTemperatureRecord = vi.fn(async (_record: TemperatureRecord) => undefined);
    const getTemperatureRecords = vi.fn(async () => []);

    const response = await processAssistantMessage('Combien de frigos ai-je ?', {
      equipment,
      addTemperatureRecord,
      getTemperatureRecords,
    });

    expect(response.action).toBe('info');
    expect(response.reply.toLowerCase()).toContain('2');
    expect(addTemperatureRecord).toHaveBeenCalledTimes(0);
  });
});

