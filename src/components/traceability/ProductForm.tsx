import React, { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { z } from 'zod';
import { EU_ALLERGENS, PRODUCT_CATEGORIES, type ProductTrace } from '../../types';
import type { ProductFormPrefill } from '../../services/productScan';
import { cn, fileToBlob, blobToUrl, compressImage } from '../../utils';

interface ProductFormProps {
  barcode?: string;
  photo?: Blob;
  prefill?: ProductFormPrefill;
  existingProduct?: ProductTrace;
  onSave: (product: ProductTrace) => void | Promise<void>;
  onCancel: () => void;
}

const productFormSchema = z
  .object({
    productName: z.string().trim().min(1, 'Nom du produit requis'),
    supplier: z.string().trim().min(1, 'Fournisseur requis'),
    lotNumber: z.string().trim().min(1, 'Numéro de lot requis'),
    receptionDate: z
      .string()
      .trim()
      .min(1, 'Date de reception requise')
      .refine((value) => Number.isFinite(new Date(value).getTime()), 'Date de reception invalide'),
    expirationDate: z
      .string()
      .trim()
      .min(1, 'Date de peremption requise')
      .refine((value) => Number.isFinite(new Date(value).getTime()), 'Date de peremption invalide'),
  })
  .superRefine((value, context) => {
    const receptionTs = new Date(value.receptionDate).getTime();
    const expirationTs = new Date(value.expirationDate).getTime();
    if (Number.isFinite(receptionTs) && Number.isFinite(expirationTs) && expirationTs < receptionTs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expirationDate'],
        message: 'La date de peremption doit etre posterieure ou egale a la date de reception',
      });
    }
  });

export default function ProductForm({ barcode, photo, prefill, existingProduct, onSave, onCancel }: ProductFormProps) {
  const [productName, setProductName] = useState(existingProduct?.productName ?? prefill?.productName ?? '');
  const [supplier, setSupplier] = useState(existingProduct?.supplier ?? prefill?.supplier ?? '');
  const [lotNumber, setLotNumber] = useState(existingProduct?.lotNumber ?? prefill?.lotNumber ?? '');
  const [receptionDate, setReceptionDate] = useState(
    existingProduct
      ? format(new Date(existingProduct.receptionDate), 'yyyy-MM-dd')
      : prefill?.receptionDate
        ? format(new Date(prefill.receptionDate), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd')
  );
  const [expirationDate, setExpirationDate] = useState(
    existingProduct
      ? format(new Date(existingProduct.expirationDate), 'yyyy-MM-dd')
      : prefill?.expirationDate
        ? format(new Date(prefill.expirationDate), 'yyyy-MM-dd')
        : ''
  );
  const [category, setCategory] = useState(existingProduct?.category ?? prefill?.category ?? PRODUCT_CATEGORIES[0]);
  const [allergens, setAllergens] = useState<string[]>(existingProduct?.allergens ?? prefill?.allergens ?? []);
  const [currentPhoto, setCurrentPhoto] = useState<Blob | undefined>(existingProduct?.photo ?? photo);
  const [photoUrl, setPhotoUrl] = useState<string | null>(existingProduct?.photoUrl ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const hasAutoPrefill = !existingProduct && Boolean(
    prefill?.productName || prefill?.supplier || prefill?.lotNumber || prefill?.expirationDate || prefill?.receptionDate || prefill?.category || prefill?.allergens?.length
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefillAppliedRef = useRef(false);

  // Apply prefill values when they arrive (e.g., OCR finishes after form mount)
  useEffect(() => {
    if (!prefill || prefillAppliedRef.current || existingProduct) return;
    const hasData = prefill.productName || prefill.supplier || prefill.lotNumber || prefill.expirationDate || prefill.receptionDate || prefill.category || prefill.allergens?.length;
    if (!hasData) return;
    prefillAppliedRef.current = true;

    if (prefill.productName && !productName) setProductName(prefill.productName);
    if (prefill.supplier && !supplier) setSupplier(prefill.supplier);
    if (prefill.lotNumber && !lotNumber) setLotNumber(prefill.lotNumber);
    if (prefill.category) setCategory(prefill.category);
    if (prefill.allergens?.length && allergens.length === 0) setAllergens(prefill.allergens);
    if (prefill.expirationDate && !expirationDate) {
      setExpirationDate(format(new Date(prefill.expirationDate), 'yyyy-MM-dd'));
    }
    if (prefill.receptionDate) {
      setReceptionDate(format(new Date(prefill.receptionDate), 'yyyy-MM-dd'));
    }
  }, [prefill, existingProduct, productName, supplier, lotNumber, expirationDate, allergens]);

  useEffect(() => {
    if (currentPhoto) {
      const url = blobToUrl(currentPhoto);
      setPhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPhotoUrl(existingProduct?.photoUrl ?? null);
  }, [currentPhoto, existingProduct?.photoUrl]);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await fileToBlob(file);
    const compressed = await compressImage(blob);
    setCurrentPhoto(compressed);
  }, []);

  const validate = useCallback((): boolean => {
    const result = productFormSchema.safeParse({
      productName,
      supplier,
      lotNumber,
      receptionDate,
      expirationDate,
    });
    if (result.success) {
      setErrors({});
      return true;
    }
    const nextErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !nextErrors[field]) {
        nextErrors[field] = issue.message;
      }
    }
    setErrors(nextErrors);
    return false;
  }, [productName, supplier, lotNumber, receptionDate, expirationDate]);

  const [saving, setSaving] = useState(false);

  const toggleAllergen = useCallback((allergen: string) => {
    setAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((value) => value !== allergen) : [...prev, allergen],
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate() || saving) return;

      setSaving(true);
      try {
        const product: ProductTrace = {
          id: existingProduct?.id ?? crypto.randomUUID(),
          status: existingProduct?.status ?? 'active',
          usedAt: existingProduct?.usedAt,
          barcode: existingProduct?.barcode ?? barcode ?? undefined,
          photo: currentPhoto,
          photoUrl: photoUrl ?? undefined,
          productName: productName.trim(),
          supplier: supplier.trim(),
          lotNumber: lotNumber.trim(),
          receptionDate: new Date(receptionDate),
          expirationDate: new Date(expirationDate),
          category,
          allergens,
          scannedAt: existingProduct?.scannedAt ?? new Date(),
        };

        await onSave(product);
      } finally {
        setSaving(false);
      }
    },
    [validate, saving, existingProduct, barcode, currentPhoto, photoUrl, productName, supplier, lotNumber, receptionDate, expirationDate, category, allergens, onSave]
  );

  const inputClass = (field: string) =>
    cn(
      'w-full px-3 py-2.5 border rounded-lg app-surface app-text placeholder-[color:var(--app-muted)] focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent transition-colors',
      errors[field]
        ? 'border-[color:var(--app-danger)]'
        : 'app-border'
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
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-[color:var(--app-surface)]/90 rounded-lg text-sm font-medium app-text shadow"
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed app-border rounded-lg app-muted active:border-[color:var(--app-accent)] hover:text-[color:var(--app-accent)] transition-colors"
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
        <div className="flex items-center gap-2 px-3 py-2 app-surface-2 rounded-lg border app-border">
          <svg className="w-5 h-5 app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <span className="text-sm font-mono app-text">{barcode}</span>
        </div>
      )}

      {hasAutoPrefill && (
        <div className="p-3 rounded-lg border border-[color:var(--app-accent)]/30 bg-[color:var(--app-accent)]/10 text-sm app-text">
          Champs pre-remplis depuis le scan et l'historique. Verifiez avant enregistrement.
        </div>
      )}

      {/* Product name */}
      <div>
        <label className="block text-sm font-medium app-muted mb-1">
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
          <p id="err-productName" className="mt-1 text-xs text-[color:var(--app-danger)]">{errors.productName}</p>
        )}
      </div>

      {/* Supplier */}
      <div>
        <label className="block text-sm font-medium app-muted mb-1">
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
          <p id="err-supplier" className="mt-1 text-xs text-[color:var(--app-danger)]">{errors.supplier}</p>
        )}
      </div>

      {/* Lot number */}
      <div>
        <label className="block text-sm font-medium app-muted mb-1">
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
          <p id="err-lotNumber" className="mt-1 text-xs text-[color:var(--app-danger)]">{errors.lotNumber}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium app-muted mb-1">
          Catégorie
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2.5 border app-border rounded-lg app-surface app-text focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent"
        >
          {PRODUCT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium app-muted mb-1">
            Allergenes (UE 1169/2011)
          </label>
          {allergens.length > 0 && (
            <button
              type="button"
              onClick={() => setAllergens([])}
              className="text-xs font-medium text-[color:var(--app-accent)] active:opacity-70"
            >
              Effacer
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EU_ALLERGENS.map((allergen) => {
            const selected = allergens.includes(allergen);
            return (
              <button
                key={allergen}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleAllergen(allergen)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-semibold active:opacity-70',
                  selected ? 'app-accent-bg' : 'app-surface-2 app-text',
                )}
              >
                {allergen}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs app-muted">
          {allergens.length > 0 ? allergens.join(', ') : 'Aucun allergene selectionne'}
        </p>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium app-muted mb-1">
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
            <p id="err-receptionDate" className="mt-1 text-xs text-[color:var(--app-danger)]">{errors.receptionDate}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium app-muted mb-1">
            DLC / DDM *
          </label>
          <input
            type="date"
            value={expirationDate}
            min={receptionDate || undefined}
            onChange={(e) => setExpirationDate(e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.expirationDate}
            aria-describedby={errors.expirationDate ? 'err-expirationDate' : undefined}
            className={inputClass('expirationDate')}
          />
          {errors.expirationDate && (
            <p id="err-expirationDate" className="mt-1 text-xs text-[color:var(--app-danger)]">{errors.expirationDate}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 border app-border rounded-lg app-text font-medium hover:bg-[color:var(--app-surface-2)] transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "flex-1 px-4 py-2.5 app-accent-bg rounded-lg font-medium active:opacity-70 transition-colors",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

