import Modal from "./Modal";
import Button from "./Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
}

export default function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "Confirmer",
  cancelText = "Annuler",
  variant = "primary",
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
      <div className="flex items-start gap-3 mb-5">
        <div
          className={[
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
            variant === 'danger'
              ? 'bg-[color:var(--app-danger)]/15 text-[color:var(--app-danger)]'
              : 'bg-[color:var(--app-accent)]/15 text-[color:var(--app-accent)]',
          ].join(' ')}
          aria-hidden
        >
          {variant === 'danger' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v.01" />
              <path d="M12 8a2 2 0 012 2c0 2-2 2-2 4" />
            </svg>
          )}
        </div>
        <p className="app-muted leading-relaxed">{message}</p>
      </div>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
