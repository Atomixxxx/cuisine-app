import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    if (days < 0) return { label: 'Expiré', color: 'text-red-600 dark:text-[#ff3b30]', bg: 'bg-red-100 dark:bg-red-900/40' };
    if (days <= 3) return { label: `Expire dans ${days} jour${days > 1 ? 's' : ''}`, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/40' };
    return { label: `${days} jours restants`, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40' };
  }, [product.expirationDate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#1d1d1f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8ed] dark:border-[#38383a] bg-white dark:bg-[#1d1d1f]">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#86868b] dark:text-[#86868b] hover:bg-[#e8e8ed] dark:hover:bg-[#1d1d1f] transition-colors"
          aria-label="Fermer"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate mx-3 flex-1 text-center">
          {product.productName}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(product)}
            className="p-1.5 rounded-lg text-[#2997FF] dark:text-[#2997FF] active:opacity-70 dark:active:opacity-70 transition-colors"
            aria-label="Modifier"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg text-[#ff3b30] active:opacity-70 dark:active:opacity-70 transition-colors"
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
        <div className="relative bg-[#e8e8ed] dark:bg-[#1d1d1f] flex items-center justify-center overflow-hidden" style={{ minHeight: '250px' }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={product.productName}
              className="w-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, maxHeight: '350px' }}
            />
          ) : (
            <div className="flex flex-col items-center text-[#86868b] dark:text-[#86868b] py-12">
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm mt-2">Pas de photo</span>
            </div>
          )}

          {/* Zoom controls */}
          {photoUrl && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 dark:bg-[#1d1d1f]/90 rounded-lg shadow p-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="p-1.5 rounded text-[#86868b] dark:text-[#86868b] hover:bg-[#e8e8ed] dark:hover:bg-[#38383a]"
                aria-label="Zoom arrière"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              <span className="text-xs font-medium text-[#86868b] dark:text-[#86868b] min-w-[3ch] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="p-1.5 rounded text-[#86868b] dark:text-[#86868b] hover:bg-[#e8e8ed] dark:hover:bg-[#38383a]"
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
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-[#1d1d1f]/80 text-[#1d1d1f] dark:text-[#86868b] shadow hover:bg-white dark:hover:bg-[#1d1d1f] transition-colors"
              aria-label="Produit précédent"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {hasNext && (
            <button
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-[#1d1d1f]/80 text-[#1d1d1f] dark:text-[#86868b] shadow hover:bg-white dark:hover:bg-[#1d1d1f] transition-colors"
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
            <InfoRow label="Numéro de lot" value={product.lotNumber} />
            <InfoRow label="Catégorie" value={product.category} />
            <InfoRow
              label="Date de réception"
              value={format(new Date(product.receptionDate), 'dd MMMM yyyy', { locale: fr })}
            />
            <InfoRow
              label="DLC / DDM"
              value={format(new Date(product.expirationDate), 'dd MMMM yyyy', { locale: fr })}
            />
            {product.barcode && <InfoRow label="Code-barres" value={product.barcode} mono />}
            <InfoRow
              label="Scanné le"
              value={format(new Date(product.scannedAt), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
            />
          </div>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-desc" className="bg-white dark:bg-[#1d1d1f] rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 id="delete-confirm-title" className="text-lg font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
              Supprimer ce produit ?
            </h3>
            <p id="delete-confirm-desc" className="text-sm text-[#86868b] dark:text-[#86868b] mb-5">
              Cette action est irréversible. Le produit «&nbsp;{product.productName}&nbsp;» sera définitivement supprimé.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-[#d1d1d6] dark:border-[#38383a] rounded-lg text-[#1d1d1f] dark:text-[#86868b] font-medium hover:bg-[#f5f5f7] dark:hover:bg-[#38383a] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2.5 bg-[#ff3b30] text-white rounded-lg font-medium active:opacity-70  transition-colors"
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
      <span className="text-xs font-medium text-[#86868b] dark:text-[#86868b] uppercase tracking-wide">
        {label}
      </span>
      <span className={cn('text-sm text-[#1d1d1f] dark:text-[#f5f5f7]', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}
