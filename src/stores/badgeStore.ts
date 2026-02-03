import { create } from 'zustand';
import { getExpiringProductsCount } from '../services/notifications';

interface BadgeState {
  expiringCount: number;
  refreshBadges: () => Promise<void>;
}

export const useBadgeStore = create<BadgeState>((set) => ({
  expiringCount: 0,
  refreshBadges: async () => {
    try {
      const count = await getExpiringProductsCount(3);
      set({ expiringCount: count });
    } catch {
      // silently fail
    }
  },
}));
