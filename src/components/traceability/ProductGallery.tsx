import { useEffect, useState } from 'react';
import { differenceInDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ProductTrace } from '../../types';
import { cn, blobToUrl } from '../../utils';

interface ProductGalleryProps {
  products: ProductTrace[];
  onSelect: (product: ProductTrace) => void;
  onDelete: (id: string) => void;
}

function getDlcStatus(expirationDate: Date): 'expired' | 'warning' | 'ok' {
  const now = new Date();
  const expDate = new Date(expirationDate);
  const days = differenceInDays(expDate, now);
  if (days < 0) return 'expired';
  if (days <= 3) return 'warning';
  return 'ok';
}

const dlcColors: Record<string, string> = {
  expired: 'bg-[color:var(--app-danger)]/10 text-[color:var(--app-danger)]',
  warning: 'bg-[color:var(--app-warning)]/10 text-[color:var(--app-warning)]',
  ok: 'bg-[color:var(--app-success)]/10 text-[color:var(--app-success)]',
};

const dlcBorderColors: Record<string, string> = {
  expired: 'ring-2 ring-[color:var(--app-danger)]/30',
  warning: 'ring-2 ring-[color:var(--app-warning)]/30',
  ok: '',
};

function ProductCard({ product, onSelect, onDelete }: { product: ProductTrace; onSelect: () => void; onDelete: () => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const dlcStatus = getDlcStatus(product.expirationDate);

  useEffect(() => {
    if (product.photo) {
      const url = blobToUrl(product.photo);
      setPhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (product.photoUrl) {
      setPhotoUrl(product.photoUrl);
      return;
    }
    setPhotoUrl(null);
  }, [product.photo, product.photoUrl]);

  return (
    <div onClick={onSelect} className={cn('relative flex flex-col rounded-2xl overflow-hidden app-card cursor-pointer active:opacity-70 transition-opacity', dlcBorderColors[dlcStatus])}>
      <div className="relative h-32 app-surface-2 flex items-center justify-center overflow-hidden">
        {photoUrl ? (
          <img src={photoUrl} alt={product.productName} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <svg className="w-10 h-10 app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )}

        <span className="absolute top-2 left-2 px-2 py-0.5 text-[12px] font-medium rounded-full app-chip backdrop-blur-sm">{product.category}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-[color:var(--app-surface)]/80 app-muted active:opacity-70 backdrop-blur-sm"
          aria-label="Supprimer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-1 p-3">
        <h3 className="text-[15px] font-semibold app-text truncate">{product.productName}</h3>
        <p className="text-[13px] app-muted truncate">{product.supplier}</p>
        <p className="text-[12px] app-muted truncate">Lot {product.lotNumber}</p>
        <div className={cn('inline-flex self-start items-center px-2 py-0.5 rounded-full text-[12px] font-medium mt-1', dlcColors[dlcStatus])}>
          DLC {format(new Date(product.expirationDate), 'dd/MM/yyyy', { locale: fr })}
        </div>
      </div>
    </div>
  );
}

export default function ProductGallery({ products, onSelect, onDelete }: ProductGalleryProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center app-panel">
        <svg className="w-16 h-16 app-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p className="ios-title3 app-muted">Aucun produit enregistre</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onSelect={() => onSelect(product)} onDelete={() => onDelete(product.id)} />
      ))}
    </div>
  );
}
