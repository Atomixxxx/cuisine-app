import type { OilChangeRecord, TemperatureRecord } from '../../types';
import { deleteRows, fetchRows, upsertRows } from '../supabaseRest';
import { toDate, toIsoDate, withWorkspaceFilter, SUPABASE_WORKSPACE_ID } from './core';

interface TemperatureRecordRow {
  workspace_id: string;
  id: string;
  equipment_id: string;
  temperature: number;
  timestamp: string;
  is_compliant: boolean;
  signature?: string | null;
}

interface OilChangeRecordRow {
  workspace_id: string;
  id: string;
  fryer_id: string;
  changed_at: string;
  action: OilChangeRecord['action'];
  operator?: string | null;
}

interface FetchTemperatureOptions {
  startDate?: Date;
  endDate?: Date;
  equipmentId?: string;
}

interface FetchOilChangeOptions {
  startDate?: Date;
  endDate?: Date;
  fryerId?: string;
}

function toTemperatureRow(value: TemperatureRecord): TemperatureRecordRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    equipment_id: value.equipmentId,
    temperature: value.temperature,
    timestamp: toIsoDate(value.timestamp),
    is_compliant: value.isCompliant,
    signature: value.signature ?? null,
  };
}

function fromTemperatureRow(value: TemperatureRecordRow): TemperatureRecord {
  return {
    id: value.id,
    equipmentId: value.equipment_id,
    temperature: value.temperature,
    timestamp: toDate(value.timestamp),
    isCompliant: value.is_compliant,
    signature: value.signature ?? undefined,
  };
}

function toOilChangeRow(value: OilChangeRecord): OilChangeRecordRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    fryer_id: value.fryerId,
    changed_at: toIsoDate(value.changedAt),
    action: value.action,
    operator: value.operator ?? null,
  };
}

function fromOilChangeRow(value: OilChangeRecordRow): OilChangeRecord {
  return {
    id: value.id,
    fryerId: value.fryer_id,
    changedAt: toDate(value.changed_at),
    action: value.action,
    operator: value.operator ?? undefined,
  };
}

export async function fetchRemoteTemperatureRecords(options: FetchTemperatureOptions = {}): Promise<TemperatureRecord[]> {
  const filters = withWorkspaceFilter();
  if (options.equipmentId) filters.push({ column: 'equipment_id', op: 'eq', value: options.equipmentId });
  if (options.startDate) filters.push({ column: 'timestamp', op: 'gte', value: options.startDate.toISOString() });
  if (options.endDate) filters.push({ column: 'timestamp', op: 'lte', value: options.endDate.toISOString() });

  const rows = await fetchRows<TemperatureRecordRow>('temperature_records', {
    filters,
    order: 'timestamp.desc',
  });
  return rows.map(fromTemperatureRow);
}

export async function upsertRemoteTemperatureRecord(value: TemperatureRecord): Promise<void> {
  await upsertRows<TemperatureRecordRow>('temperature_records', [toTemperatureRow(value)], 'workspace_id,id');
}

export async function fetchRemoteOilChangeRecords(options: FetchOilChangeOptions = {}): Promise<OilChangeRecord[]> {
  const filters = withWorkspaceFilter();
  if (options.fryerId) filters.push({ column: 'fryer_id', op: 'eq', value: options.fryerId });
  if (options.startDate) filters.push({ column: 'changed_at', op: 'gte', value: options.startDate.toISOString() });
  if (options.endDate) filters.push({ column: 'changed_at', op: 'lte', value: options.endDate.toISOString() });

  const rows = await fetchRows<OilChangeRecordRow>('oil_change_records', {
    filters,
    order: 'changed_at.desc',
  });
  return rows.map(fromOilChangeRow);
}

export async function upsertRemoteOilChangeRecord(value: OilChangeRecord): Promise<void> {
  await upsertRows<OilChangeRecordRow>('oil_change_records', [toOilChangeRow(value)], 'workspace_id,id');
}

export async function deleteRemoteOilChangeRecord(id: string): Promise<void> {
  await deleteRows('oil_change_records', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}
