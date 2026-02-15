import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import {
  deleteRemoteOrder,
  fetchRemoteOrders,
  upsertRemoteOrder,
} from '../../services/cloudSync';
import { sanitize } from '../../utils';
import type { AppState } from '../appStore';
import type { Order, OrderFilters, OrderStatus } from '../../types';
import { runCloudRead, runCloudTask } from './cloudUtils';

type OrderSlice = Pick<
  AppState,
  'getOrders' | 'addOrder' | 'updateOrder' | 'deleteOrder' | 'generateOrderNumber'
>;

function applyOrderFilters(orders: Order[], filters?: OrderFilters): Order[] {
  if (!filters) return orders;

  const statuses: OrderStatus[] | null = filters.status
    ? Array.isArray(filters.status)
      ? filters.status
      : [filters.status]
    : null;
  const supplierFilter = filters.supplier?.trim().toLowerCase();
  const fromTime = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const toTime = filters.dateTo ? new Date(filters.dateTo).getTime() : null;

  return orders.filter((order) => {
    if (statuses && !statuses.includes(order.status)) return false;
    if (supplierFilter && order.supplier.trim().toLowerCase() !== supplierFilter) return false;
    const orderTime = new Date(order.orderDate).getTime();
    if (fromTime !== null && orderTime < fromTime) return false;
    if (toTime !== null && orderTime > toTime) return false;
    return true;
  });
}

function sanitizeOrder(value: Order): Order {
  const sanitizedItems = value.items.map((item) => ({
    ...item,
    productName: sanitize(item.productName),
    notes: item.notes ? sanitize(item.notes) : undefined,
    totalPriceHT:
      typeof item.totalPriceHT === 'number'
        ? item.totalPriceHT
        : Math.round(item.quantity * (item.unitPriceHT ?? 0) * 100) / 100,
  }));

  return {
    ...value,
    supplier: sanitize(value.supplier),
    notes: value.notes ? sanitize(value.notes) : undefined,
    items: sanitizedItems,
    totalHT: Math.round(
      sanitizedItems.reduce((sum, item) => sum + (item.totalPriceHT ?? 0), 0) * 100,
    ) / 100,
  };
}

export const createOrderSlice: StateCreator<AppState, [], [], OrderSlice> = () => ({
  getOrders: async (filters) => {
    const remoteOrders = await runCloudRead('orders:list', fetchRemoteOrders);
    if (remoteOrders) {
      if (remoteOrders.length > 0) {
        await db.orders.clear();
        await db.orders.bulkPut(remoteOrders);
      } else {
        const localOrders = await db.orders.orderBy('createdAt').reverse().toArray();
        if (localOrders.length > 0) {
          await runCloudTask('orders:seed', async () => {
            for (const item of localOrders) await upsertRemoteOrder(item);
          });
          return applyOrderFilters(localOrders, filters);
        }
      }
      return applyOrderFilters(remoteOrders, filters);
    }

    const localOrders = await db.orders.orderBy('createdAt').reverse().toArray();
    return applyOrderFilters(localOrders, filters);
  },

  addOrder: async (order) => {
    const payload = sanitizeOrder(order);
    await db.orders.add(payload);
    await runCloudTask('orders:add', async () => {
      await upsertRemoteOrder(payload);
    });
  },

  updateOrder: async (order) => {
    const payload = sanitizeOrder(order);
    await db.orders.put(payload);
    await runCloudTask('orders:update', async () => {
      await upsertRemoteOrder(payload);
    });
  },

  deleteOrder: async (id) => {
    await db.orders.delete(id);
    await runCloudTask('orders:delete', async () => {
      await deleteRemoteOrder(id);
    });
  },

  generateOrderNumber: async () => {
    const year = new Date().getFullYear();
    const localOrders = await db.orders.toArray();
    const remoteOrders = await runCloudRead('orders:list:sequence', fetchRemoteOrders);
    const source = remoteOrders
      ? [...remoteOrders, ...localOrders.filter((local) => !remoteOrders.some((item) => item.id === local.id))]
      : localOrders;

    const regex = new RegExp(`^CMD-${year}-(\\d+)$`);
    const maxSeq = source.reduce((max, order) => {
      const match = regex.exec(order.orderNumber);
      if (!match) return max;
      const seq = Number.parseInt(match[1], 10);
      if (!Number.isFinite(seq)) return max;
      return Math.max(max, seq);
    }, 0);

    return `CMD-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
  },
});
