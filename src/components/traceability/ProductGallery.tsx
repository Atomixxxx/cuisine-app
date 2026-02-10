import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { differenceInDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ProductTrace } from '../../types';
import { cn, blobToUrl, revokeUrl } from '../../utils';

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

function ProductCard({
  product,
  onSelect,
  onDelete,
}: {
  product: ProductTrace;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const isUsed = product.status === 'used';
  const dlcStatus = getDlcStatus(product.expirationDate);
  const hasCloudPhoto = Boolean(product.photoUrl);
  const hasLocalPhoto = Boolean(product.photo);
  const mediaStatus = hasCloudPhoto ? 'cloud' : hasLocalPhoto ? 'local' : 'missing';

  useEffect(() => {
    if (product.photo) {
      const url = blobToUrl(product.photo);
      setPhotoUrl(url);
      return () => revokeUrl(url);
    }
    if (product.photoUrl) {
      setPhotoUrl(product.photoUrl);
      return;
    }
    setPhotoUrl(null);
  }, [product.photo, product.photoUrl]);

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative flex flex-col rounded-2xl overflow-hidden app-card cursor-pointer active:opacity-70 transition-opacity',
        !isUsed && dlcBorderColors[dlcStatus],
        isUsed && 'opacity-50',
      )}
    >
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
        <h3 className="ios-body font-semibold app-text truncate">{product.productName}</h3>
        <p className="ios-caption app-muted truncate">{product.supplier}</p>
        <p className="text-[12px] app-muted truncate">Lot {product.lotNumber}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {isUsed ? (
            <div className="inline-flex self-start items-center px-2 py-0.5 rounded-full text-[12px] font-medium bg-[color:var(--app-surface-3)] app-muted">
              Utilise
            </div>
          ) : (
            <div className={cn('inline-flex self-start items-center px-2 py-0.5 rounded-full text-[12px] font-medium', dlcColors[dlcStatus])}>
              DLC {format(new Date(product.expirationDate), 'dd/MM/yyyy', { locale: fr })}
            </div>
          )}
          {mediaStatus === 'local' && (
            <div className="inline-flex self-start items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[color:var(--app-warning)]/12 text-[color:var(--app-warning)]">
              Photo locale
            </div>
          )}
          {mediaStatus === 'missing' && (
            <div className="inline-flex self-start items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[color:var(--app-danger)]/12 text-[color:var(--app-danger)]">
              Sans photo
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductGallery({ products, onSelect, onDelete }: ProductGalleryProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    const updateColumns = () => {
      const width = element.clientWidth;
      setColumnCount(width >= 900 ? 3 : 2);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rowItems = useMemo(() => {
    const rows: ProductTrace[][] = [];
    for (let i = 0; i < products.length; i += columnCount) {
      rows.push(products.slice(i, i + columnCount));
    }
    return rows;
  }, [products, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: rowItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 265,
    overscan: 6,
  });

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
    <div ref={parentRef} className="h-[62vh] overflow-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const productsInRow = rowItems[virtualRow.index] ?? [];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid gap-3 pb-3" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                {productsInRow.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={() => onSelect(product)}
                    onDelete={() => onDelete(product.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

