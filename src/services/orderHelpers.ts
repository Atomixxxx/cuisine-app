import { z } from 'zod';
import type { OrderItem, OrderStatus } from '../types';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['sent'],
  sent: ['received'],
  received: ['invoiced'],
  invoiced: [],
};

const orderItemSchema = z.object({
  id: z.string().trim().min(1),
  productName: z.string().trim().min(1, 'Le nom du produit est requis'),
  quantity: z.number().finite('Quantite invalide').positive('La quantite doit etre positive'),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'unite']),
  unitPriceHT: z.number().finite('Prix unitaire invalide').min(0, 'Le prix unitaire doit etre positif').optional(),
  totalPriceHT: z.number().finite('Total HT invalide').min(0, 'Le total HT doit etre positif').optional(),
  notes: z.string().trim().optional(),
});

export const orderSchema = z.object({
  supplier: z.string().trim().min(1, 'Le fournisseur est requis'),
  items: z.array(orderItemSchema).min(1, 'Au moins un article est requis'),
  orderDate: z.date(),
  totalHT: z.number().finite('Total HT invalide').min(0, 'Le total HT doit etre positif'),
  notes: z.string().trim().optional(),
});

export function canTransitionStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function getNextStatuses(current: OrderStatus): OrderStatus[] {
  return ORDER_TRANSITIONS[current];
}

export function calculateOrderTotal(items: OrderItem[]): number {
  const total = items.reduce((sum, item) => {
    const explicit = typeof item.totalPriceHT === 'number' ? item.totalPriceHT : undefined;
    const fallback = item.quantity * (item.unitPriceHT ?? 0);
    return sum + (explicit ?? fallback);
  }, 0);
  return Math.round(total * 100) / 100;
}
