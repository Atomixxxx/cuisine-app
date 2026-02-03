import React from 'react';
import { useToastStore } from '../../stores/toastStore';
import { cn } from '../../utils';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] flex flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl ios-card-shadow text-[15px] font-medium animate-fade-in-up max-w-sm w-full',
            'bg-white dark:bg-[#1d1d1f]',
            toast.type === 'error'
              ? 'border-l-4 border-l-[#ff3b30] dark:border-l-[#ff3b30]'
              : 'border-l-4 border-l-[#34c759] dark:border-l-[#34c759]'
          )}
          onClick={() => removeToast(toast.id)}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke={toast.type === 'error' ? '#ff3b30' : '#34c759'} strokeWidth={2}>
            {toast.type === 'error' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            )}
          </svg>
          <span className="text-[#1d1d1f] dark:text-[#f5f5f7]">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
