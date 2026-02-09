import { useToastStore } from '../../stores/toastStore';
import { cn } from '../../utils';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-4 right-4 z-[100] flex flex-col items-center gap-2"
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl app-card ios-body font-medium animate-fade-in-up max-w-sm w-full',
            toast.type === 'error'
              ? 'border-l-4 border-l-[color:var(--app-danger)]'
              : toast.type === 'warning'
                ? 'border-l-4 border-l-[color:var(--app-warning)]'
              : 'border-l-4 border-l-[color:var(--app-success)]'
          )}
          onClick={() => removeToast(toast.id)}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke={
              toast.type === 'error'
                ? 'var(--app-danger)'
                : toast.type === 'warning'
                  ? 'var(--app-warning)'
                  : 'var(--app-success)'
            }
            strokeWidth={2}
          >
            {toast.type === 'error' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            ) : toast.type === 'warning' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            )}
          </svg>
          <span className="app-text">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

