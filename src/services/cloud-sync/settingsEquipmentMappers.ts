import type { AppSettings, Equipment } from '../../types';
import { SUPABASE_WORKSPACE_ID } from './core';

export interface AppSettingsRow {
  workspace_id: string;
  id: string;
  establishment_name: string;
  dark_mode: boolean;
  onboarding_done: boolean;
  price_alert_threshold: number;
  gemini_api_key?: string | null;
}

export interface EquipmentRow {
  workspace_id: string;
  id: string;
  name: string;
  type: Equipment['type'];
  min_temp: number;
  max_temp: number;
  sort_order: number;
}

export function toSettingsRow(value: AppSettings): AppSettingsRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    establishment_name: value.establishmentName,
    dark_mode: value.darkMode,
    onboarding_done: value.onboardingDone,
    price_alert_threshold: value.priceAlertThreshold,
    gemini_api_key: value.geminiApiKey ?? null,
  };
}

export function fromSettingsRow(value: AppSettingsRow): AppSettings {
  return {
    id: value.id,
    establishmentName: value.establishment_name,
    darkMode: value.dark_mode,
    onboardingDone: value.onboarding_done,
    priceAlertThreshold: value.price_alert_threshold,
    geminiApiKey: value.gemini_api_key ?? undefined,
  };
}

export function toEquipmentRow(value: Equipment): EquipmentRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    name: value.name,
    type: value.type,
    min_temp: value.minTemp,
    max_temp: value.maxTemp,
    sort_order: value.order,
  };
}

export function fromEquipmentRow(value: EquipmentRow): Equipment {
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    minTemp: value.min_temp,
    maxTemp: value.max_temp,
    order: value.sort_order,
  };
}
