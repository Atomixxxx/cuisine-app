import { SUPABASE_WORKSPACE_ID, isSupabaseConfigured } from '../supabaseRest';

export type MaybeDate = Date | string;

export interface WorkspaceFilter {
  column: string;
  op: string;
  value: string;
}

export function toIsoDate(value: MaybeDate): string {
  return new Date(value).toISOString();
}

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function withWorkspaceFilter(filters: WorkspaceFilter[] = []): WorkspaceFilter[] {
  return [{ column: 'workspace_id', op: 'eq', value: SUPABASE_WORKSPACE_ID }, ...filters];
}

export function isCloudSyncEnabled(): boolean {
  return isSupabaseConfigured;
}

export { SUPABASE_WORKSPACE_ID };
