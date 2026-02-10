import type { Task } from '../../types';
import { deleteRows, fetchRows, upsertRows } from '../supabaseRest';
import { toDate, toIsoDate, withWorkspaceFilter, SUPABASE_WORKSPACE_ID } from './core';

interface TaskRow {
  workspace_id: string;
  id: string;
  title: string;
  category: Task['category'];
  priority: Task['priority'];
  completed: boolean;
  estimated_time?: number | null;
  notes?: string | null;
  recurring: Task['recurring'];
  created_at: string;
  completed_at?: string | null;
  archived: boolean;
  sort_order: number;
}

function toTaskRow(value: Task): TaskRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    title: value.title,
    category: value.category,
    priority: value.priority,
    completed: value.completed,
    estimated_time: value.estimatedTime ?? null,
    notes: value.notes ?? null,
    recurring: value.recurring,
    created_at: toIsoDate(value.createdAt),
    completed_at: value.completedAt ? toIsoDate(value.completedAt) : null,
    archived: value.archived,
    sort_order: value.order,
  };
}

function fromTaskRow(value: TaskRow): Task {
  return {
    id: value.id,
    title: value.title,
    category: value.category,
    priority: value.priority,
    completed: value.completed,
    estimatedTime: value.estimated_time ?? undefined,
    notes: value.notes ?? undefined,
    recurring: value.recurring,
    createdAt: toDate(value.created_at),
    completedAt: value.completed_at ? toDate(value.completed_at) : undefined,
    archived: value.archived,
    order: value.sort_order,
  };
}

export async function fetchRemoteTasks(): Promise<Task[]> {
  const rows = await fetchRows<TaskRow>('tasks', {
    filters: withWorkspaceFilter(),
    order: 'sort_order.asc',
  });
  return rows.map(fromTaskRow);
}

export async function upsertRemoteTask(value: Task): Promise<void> {
  await upsertRows<TaskRow>('tasks', [toTaskRow(value)], 'workspace_id,id');
}

export async function deleteRemoteTask(id: string): Promise<void> {
  await deleteRows('tasks', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}
