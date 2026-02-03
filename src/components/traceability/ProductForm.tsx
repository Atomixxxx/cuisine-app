import React, { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { PRODUCT_CATEGORIES } from '../../types';
import type { ProductTrace } from '../../types';
import { cn, fileToBlob, blobToUrl, compressImage } from '../../utils';

interface ProductFormProps {
  barcode?: string;
  photo?: Blob;
  existingProduct?: ProductTrace;
  onSave: (product: ProductTrace) => void | Promise<void>;
  onCancel: () => void;
}

export default function ProductForm({ barcode, photo, existingProduct, onSave, onCancel }: ProductFormProps) {
  const [productName, setProductName] = useState(existingProduct?.productName ?? '');
  const [supplier, setSupplier] = useState(existingProduct?.supplier ?? '');
  const [lotNumber, setLotNumber] = useState(existingProduct?.lotNumber ?? '');
  const [receptionDate, setReceptionDate] = useState(
    existingProduct ? format(new Date(existingProduct.receptionDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [expirationDate, setExpirationDate] = useState(
    existingProduct ? format(new Date(existingProduct.expirationDate), 'yyyy-MM-dd') : ''
  );
  const [category, setCategory] = useState(existingProduct?.category ?? PRODUCT_CATEGORIES[0]);
  const [currentPhoto, setCurrentPhoto] = useState<Blob | undefined>(existingProduct?.photo ?? photo);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentPhoto) {
      const url = blobToUrl(currentPhoto);
      setPhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPhotoUrl(null);
  }, [currentPhoto]);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await fileToBlob(file);
    const compressed = await compressImage(blob);
    setCurrentPhoto(compressed);
  }, []);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!productName.trim()) errs.productName = 'Nom du produit requis';
    if (!supplier.trim()) errs.supplier = 'Fournisseur requis';
    if (!lotNumber.trim()) errs.lotNumber = 'Numéro de lot requis';
    if (!receptionDate) errs.receptionDate = 'Date de réception requise';
    if (!expirationDate) errs.expirationDate = 'Date de péremption requise';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [productName, supplier, lotNumber, receptionDate, expirationDate]);

  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate() || saving) return;

      setSaving(true);
      try {
        const product: ProductTrace = {
          id: existingProduct?.id ?? crypto.randomUUID(),
          barcode: existingProduct?.barcode ?? barcode ?? undefined,
          photo: currentPhoto,
          photoUrl: photoUrl ?? undefined,
          productName: productName.trim(),
          supplier: supplier.trim(),
          lotNumber: lotNumber.trim(),
          receptionDate: new Date(receptionDate),
          expirationDate: new Date(expirationDate),
          category,
          scannedAt: existingProduct?.scannedAt ?? new Date(),
        };

        await onSave(product);
      } finally {
        setSaving(false);
      }
    },
    [validate, saving, existingProduct, barcode, currentPhoto, photoUrl, productName, supplier, lotNumber, receptionDate, expirationDate, category, onSave]
  );

  const inputClass = (field: string) =>
    cn(
      'w-full px-3 py-2.5 border rounded-lg bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] focus:ring-2 focus:ring-[#2997FF] focus:border-transparent transition-colors',
      errors[field]
        ? 'border-[#ff3b30] dark:border-[#ff3b30]'
        : 'border-[#d1d1d6] dark:border-[#38383a]'
    );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Photo preview */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />

        {photoUrl ? (
          <div className="relative">
            <img
              src={photoUrl}
              alt="Photo produit"
              className="w-full h-40 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 dark:bg-[#1d1d1f]/90 rounded-lg text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] shadow"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Changer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[#d1d1d6] dark:border-[#38383a] rounded-lg text-[#86868b] dark:text-[#86868b] active:border-[#2997FF] hover:text-[#2997FF] dark:hover:border-[#2997FF] dark:hover:text-[#2997FF] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Ajouter une photo
          </button>
        )}
      </div>

      {/* Barcode display */}
      {barcode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#f5f5f7] dark:bg-[#1d1d1f] rounded-lg border border-[#e8e8ed] dark:border-[#38383a]">
          <svg className="w-5 h-5 text-[#86868b] dark:text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <span className="text-sm font-mono text-[#1d1d1f] dark:text-[#86868b]">{barcode}</span>
        </div>
      )}

      {/* Product name */}
      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
          Nom du produit *
        </label>
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="Ex: Filet de saumon"
          aria-required="true"
          aria-invalid={!!errors.productName}
          aria-describedby={errors.productName ? 'err-productName' : undefined}
          className={inputClass('productName')}
        />
        {errors.productName && (
          <p id="err-productName" className="mt-1 text-xs text-[#ff3b30]">{errors.productName}</p>
        )}
      </div>

      {/* Supplier */}
      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
          Fournisseur *
        </label>
        <input
          type="text"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Ex: Pomona"
          aria-required="true"
          aria-invalid={!!errors.supplier}
          aria-describedby={errors.supplier ? 'err-supplier' : undefined}
          className={inputClass('supplier')}
        />
        {errors.supplier && (
          <p id="err-supplier" className="mt-1 text-xs text-[#ff3b30]">{errors.supplier}</p>
        )}
      </div>

      {/* Lot number */}
      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
          Numéro de lot *
        </label>
        <input
          type="text"
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
          placeholder="Ex: LOT-2024-0523"
          aria-required="true"
          aria-invalid={!!errors.lotNumber}
          aria-describedby={errors.lotNumber ? 'err-lotNumber' : undefined}
          className={inputClass('lotNumber')}
        />
        {errors.lotNumber && (
          <p id="err-lotNumber" className="mt-1 text-xs text-[#ff3b30]">{errors.lotNumber}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
          Catégorie
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2.5 border border-[#d1d1d6] dark:border-[#38383a] rounded-lg bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] focus:ring-2 focus:ring-[#2997FF] focus:border-transparent"
        >
          {PRODUCT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
            Date de réception *
          </label>
          <input
            type="date"
            value={receptionDate}
            onChange={(e) => setReceptionDate(e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.receptionDate}
            aria-describedby={errors.receptionDate ? 'err-receptionDate' : undefined}
            className={inputClass('receptionDate')}
          />
          {errors.receptionDate && (
            <p id="err-receptionDate" className="mt-1 text-xs text-[#ff3b30]">{errors.receptionDate}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
            DLC / DDM *
          </label>
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.expirationDate}
            aria-describedby={errors.expirationDate ? 'err-expirationDate' : undefined}
            className={inputClass('expirationDate')}
          />
          {errors.expirationDate && (
            <p id="err-expirationDate" className="mt-1 text-xs text-[#ff3b30]">{errors.expirationDate}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 border border-[#d1d1d6] dark:border-[#38383a] rounded-lg text-[#1d1d1f] dark:text-[#86868b] font-medium hover:bg-[#f5f5f7] dark:hover:bg-[#38383a] transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "flex-1 px-4 py-2.5 bg-[#2997FF] text-white rounded-lg font-medium hover:bg-[#2997FF] active:opacity-70 transition-colors",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
