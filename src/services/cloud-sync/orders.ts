import type { Order } from '../../types';
import { deleteRows, fetchRows, upsertRows } from '../supabaseRest';
import { toDate, toIsoDate, withWorkspaceFilter, SUPABASE_WORKSPACE_ID } from './core';

interface OrderRow {
  workspace_id: string;
  id: string;
  order_number: string;
  supplier: string;
  status: Order['status'];
  items: Order['items'];
  order_date: string;
  expected_delivery_date?: string | null;
  actual_delivery_date?: string | null;
  total_ht: number;
  notes?: string | null;
  invoice_id?: string | null;
  created_at: string;
  updated_at: string;
}

function toOrderRow(value: Order): OrderRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    order_number: value.orderNumber,
    supplier: value.supplier,
    status: value.status,
    items: value.items,
    order_date: toIsoDate(value.orderDate),
    expected_delivery_date: value.expectedDeliveryDate ? toIsoDate(value.expectedDeliveryDate) : null,
    actual_delivery_date: value.actualDeliveryDate ? toIsoDate(value.actualDeliveryDate) : null,
    total_ht: value.totalHT,
    notes: value.notes ?? null,
    invoice_id: value.invoiceId ?? null,
    created_at: toIsoDate(value.createdAt),
    updated_at: toIsoDate(value.updatedAt),
  };
}

function fromOrderRow(value: OrderRow): Order {
  return {
    id: value.id,
    orderNumber: value.order_number,
    supplier: value.supplier,
    status: value.status,
    items: value.items ?? [],
    orderDate: toDate(value.order_date),
    expectedDeliveryDate: value.expected_delivery_date ? toDate(value.expected_delivery_date) : undefined,
    actualDeliveryDate: value.actual_delivery_date ? toDate(value.actual_delivery_date) : undefined,
    totalHT: value.total_ht,
    notes: value.notes ?? undefined,
    invoiceId: value.invoice_id ?? undefined,
    createdAt: toDate(value.created_at),
    updatedAt: toDate(value.updated_at),
  };
}

export async function fetchRemoteOrders(): Promise<Order[]> {
  const rows = await fetchRows<OrderRow>('orders', {
    filters: withWorkspaceFilter(),
    order: 'created_at.desc',
  });
  return rows.map(fromOrderRow);
}

export async function upsertRemoteOrder(value: Order): Promise<void> {
  await upsertRows<OrderRow>('orders', [toOrderRow(value)], 'workspace_id,id');
}

export async function deleteRemoteOrder(id: string): Promise<void> {
  await deleteRows('orders', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}
