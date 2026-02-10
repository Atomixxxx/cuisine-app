import type { AppSettings, Equipment } from '../../types';
import { deleteRows, fetchRows, upsertRows } from '../supabaseRest';
import {
  toSettingsRow,
  fromSettingsRow,
  toEquipmentRow,
  fromEquipmentRow,
  type AppSettingsRow,
  type EquipmentRow,
} from './settingsEquipmentMappers';
import { withWorkspaceFilter } from './core';

export async function fetchRemoteSettings(): Promise<AppSettings[]> {
  const rows = await fetchRows<AppSettingsRow>('settings', {
    filters: withWorkspaceFilter(),
    order: 'id.asc',
  });
  return rows.map(fromSettingsRow);
}

export async function upsertRemoteSettings(value: AppSettings): Promise<void> {
  await upsertRows('settings', [toSettingsRow(value)], 'workspace_id,id');
}

export async function fetchRemoteEquipment(): Promise<Equipment[]> {
  const rows = await fetchRows<EquipmentRow>('equipment', {
    filters: withWorkspaceFilter(),
    order: 'sort_order.asc',
  });
  return rows.map(fromEquipmentRow);
}

export async function upsertRemoteEquipment(value: Equipment): Promise<void> {
  await upsertRows('equipment', [toEquipmentRow(value)], 'workspace_id,id');
}

export async function deleteRemoteEquipment(id: string): Promise<void> {
  await deleteRows('equipment', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}
