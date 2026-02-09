import React, { useEffect, useRef, useCallback } from "react";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-none sm:max-w-4xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      previousFocusRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
    } else {
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] p-2 sm:p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={[
          "animate-slide-up w-full rounded-t-[20px] sm:rounded-[20px] app-card outline-none shadow-[0_18px_42px_rgba(15,23,42,0.35)]",
          sizeClasses[size],
        ].join(" ")}
      >
        {/* Handle bar (iOS sheet style) */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-9 h-1 rounded-full app-surface-3" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <h2 id={titleId} className="ios-title3 app-text">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full app-surface-2 app-muted active:opacity-70 transition-opacity"
            aria-label="Fermer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className={`px-4 pb-4 sm:px-6 sm:pb-6 overflow-y-auto ${size === 'full' ? 'max-h-[85vh]' : 'max-h-[70vh]'}`}>{children}</div>
      </div>
    </div>
  );
}
