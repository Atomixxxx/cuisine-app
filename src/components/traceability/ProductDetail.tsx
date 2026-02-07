import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ProductTrace } from '../../types';
import { cn, blobToUrl } from '../../utils';

interface ProductDetailProps {
  product: ProductTrace;
  products: ProductTrace[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (product: ProductTrace) => void;
  onNavigate: (product: ProductTrace) => void;
}

export default function ProductDetail({ product, products, onClose, onDelete, onEdit, onNavigate }: ProductDetailProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const currentIndex = useMemo(
    () => products.findIndex((p) => p.id === product.id),
    [products, product.id]
  );

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < products.length - 1;

  useEffect(() => {
    if (product.photo) {
      const url = blobToUrl(product.photo);
      setPhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (product.photoUrl) {
      setPhotoUrl(product.photoUrl);
    } else {
      setPhotoUrl(null);
    }
  }, [product.photo, product.photoUrl]);

  // Reset zoom on product change
  useEffect(() => {
    setZoom(1);
  }, [product.id]);

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(products[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, products, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      onNavigate(products[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, products, onNavigate]);

  const handleConfirmDelete = useCallback(() => {
    onDelete(product.id);
    onClose();
  }, [onDelete, product.id, onClose]);

  const dlcStatus = useMemo(() => {
    const days = differenceInDays(new Date(product.expirationDate), new Date());
    if (days < 0) return { label: 'Expire', color: 'text-[color:var(--app-danger)]', bg: 'bg-[color:var(--app-danger)]/10' };
    if (days <= 3) return { label: `Expire dans ${days} jour${days > 1 ? 's' : ''}`, color: 'text-[color:var(--app-warning)]', bg: 'bg-[color:var(--app-warning)]/12' };
    return { label: `${days} jours restants`, color: 'text-[color:var(--app-success)]', bg: 'bg-[color:var(--app-success)]/12' };
  }, [product.expirationDate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col app-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 app-header">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg app-muted hover:bg-[color:var(--app-surface-3)] transition-colors"
          aria-label="Fermer"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-base font-semibold app-text truncate mx-3 flex-1 text-center">
          {product.productName}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(product)}
            className="p-1.5 rounded-lg text-[color:var(--app-accent)] active:opacity-70 dark:active:opacity-70 transition-colors"
            aria-label="Modifier"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg text-[color:var(--app-danger)] active:opacity-70 dark:active:opacity-70 transition-colors"
            aria-label="Supprimer"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Photo */}
        <div className="relative app-surface-2 flex items-center justify-center overflow-hidden" style={{ minHeight: '250px' }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={product.productName}
              className="w-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, maxHeight: '350px' }}
            />
          ) : (
            <div className="flex flex-col items-center app-muted py-12">
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm mt-2">Pas de photo</span>
            </div>
          )}

          {/* Zoom controls */}
          {photoUrl && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-[color:var(--app-surface)]/90 border app-border rounded-lg shadow p-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="p-1.5 rounded app-muted hover:bg-[color:var(--app-surface-3)]"
                aria-label="Zoom arriere"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              <span className="text-xs font-medium app-muted min-w-[3ch] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="p-1.5 rounded app-muted hover:bg-[color:var(--app-surface-3)]"
                aria-label="Zoom avant"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}

          {/* Navigation arrows */}
          {hasPrev && (
            <button
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[color:var(--app-surface)]/85 app-text shadow hover:bg-[color:var(--app-surface)] transition-colors"
              aria-label="Produit precedent"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {hasNext && (
            <button
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[color:var(--app-surface)]/85 app-text shadow hover:bg-[color:var(--app-surface)] transition-colors"
              aria-label="Produit suivant"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Product info */}
        <div className="p-4 flex flex-col gap-4">
          {/* DLC status badge */}
          <div className={cn('inline-flex self-start items-center px-3 py-1.5 rounded-full text-sm font-medium', dlcStatus.bg, dlcStatus.color)}>
            {dlcStatus.label}
          </div>

          {/* Info rows */}
          <div className="grid gap-3">
            <InfoRow label="Fournisseur" value={product.supplier} />
            <InfoRow label="Numero de lot" value={product.lotNumber} />
            <InfoRow label="Catégorie" value={product.category} />
            <InfoRow
              label="Date de reception"
              value={format(new Date(product.receptionDate), 'dd MMMM yyyy', { locale: fr })}
            />
            <InfoRow
              label="DLC / DDM"
              value={format(new Date(product.expirationDate), 'dd MMMM yyyy', { locale: fr })}
            />
            {product.barcode && <InfoRow label="Code-barres" value={product.barcode} mono />}
            <InfoRow
              label="Scanne le"
              value={format(new Date(product.scannedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
            />
          </div>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-desc" className="app-panel p-6 max-w-sm w-full">
            <h3 id="delete-confirm-title" className="text-lg font-semibold app-text mb-2">
              Supprimer ce produit ?
            </h3>
            <p id="delete-confirm-desc" className="text-sm app-muted mb-5">
              Cette action est irreversible. Le produit "{product.productName}" sera definitivement supprime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-lg app-surface-2 app-border app-text font-medium hover:bg-[color:var(--app-surface-3)] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2.5 app-danger-bg rounded-lg font-medium active:opacity-70 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium app-muted uppercase tracking-wide">
        {label}
      </span>
      <span className={cn('text-sm app-text', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}

