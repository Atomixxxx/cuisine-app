import { db } from './db';
import { STORAGE_KEYS } from '../constants/storageKeys';

export async function getExpiringProductsCount(withinDays = 3): Promise<number> {
  const products = await db.productTraces.toArray();
  const now = Date.now();
  return products.filter(p => {
    const daysLeft = Math.ceil((new Date(p.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24));
    return daysLeft >= 0 && daysLeft <= withinDays;
  }).length;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function checkAndNotifyExpiringProducts(): Promise<void> {
  const products = await db.productTraces.toArray();
  const now = Date.now();
  const expired: typeof products = [];
  const soonExpiring: typeof products = [];

  for (const product of products) {
    const daysLeft = Math.ceil((new Date(product.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      expired.push(product);
    } else if (daysLeft <= 3) {
      soonExpiring.push(product);
    }
  }

  if (expired.length === 0 && soonExpiring.length === 0) return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Avoid spamming: check if we already notified today
  const lastNotifKey = STORAGE_KEYS.notificationsLastExpiry;
  const lastNotif = localStorage.getItem(lastNotifKey);
  const today = new Date().toDateString();
  if (lastNotif === today) return;

  localStorage.setItem(lastNotifKey, today);

  const soonExpiringCount = soonExpiring.length;
  const expiredCount = expired.length;

  let body = '';
  if (expiredCount > 0 && soonExpiringCount > 0) {
    body = `${expiredCount} produit${expiredCount > 1 ? 's' : ''} expiré${expiredCount > 1 ? 's' : ''}, ${soonExpiringCount} DLC proche${soonExpiringCount > 1 ? 's' : ''}`;
  } else if (soonExpiringCount > 0) {
    body = `${soonExpiringCount} produit${soonExpiringCount > 1 ? 's' : ''} avec DLC dans les 3 jours`;
  } else {
    body = `${expiredCount} produit${expiredCount > 1 ? 's' : ''} expiré${expiredCount > 1 ? 's' : ''}`;
  }

  new Notification('CuisineControl — Alerte DLC', {
    body,
    icon: '/icons/icon-192.svg',
    tag: 'expiry-alert',
  });
}
