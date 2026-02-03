import { db } from './db';

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
  const expiring = products.filter(p => {
    const daysLeft = Math.ceil((new Date(p.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24));
    return daysLeft >= 0 && daysLeft <= 3;
  });

  if (expiring.length === 0) return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Avoid spamming: check if we already notified today
  const lastNotifKey = 'cuisine_last_expiry_notif';
  const lastNotif = localStorage.getItem(lastNotifKey);
  const today = new Date().toDateString();
  if (lastNotif === today) return;

  localStorage.setItem(lastNotifKey, today);

  const expired = expiring.filter(p =>
    Math.ceil((new Date(p.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24)) < 0
  );
  const soonExpiring = expiring.length - expired.length;

  let body = '';
  if (expired.length > 0 && soonExpiring > 0) {
    body = `${expired.length} produit${expired.length > 1 ? 's' : ''} expiré${expired.length > 1 ? 's' : ''}, ${soonExpiring} DLC proche${soonExpiring > 1 ? 's' : ''}`;
  } else if (soonExpiring > 0) {
    body = `${soonExpiring} produit${soonExpiring > 1 ? 's' : ''} avec DLC dans les 3 jours`;
  } else {
    body = `${expired.length} produit${expired.length > 1 ? 's' : ''} expiré${expired.length > 1 ? 's' : ''}`;
  }

  new Notification('CuisineControl — Alerte DLC', {
    body,
    icon: '/pwa-192x192.png',
    tag: 'expiry-alert',
  });
}
