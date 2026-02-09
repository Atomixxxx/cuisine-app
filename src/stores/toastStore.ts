import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning';
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: 'success' | 'error' | 'warning') => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export function showError(message: string) {
  useToastStore.getState().addToast(message, 'error');
}

export function showSuccess(message: string) {
  useToastStore.getState().addToast(message, 'success');
}

export function showWarning(message: string) {
  useToastStore.getState().addToast(message, 'warning');
}
