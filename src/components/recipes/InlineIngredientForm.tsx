import { useState } from 'react';
import type { Ingredient, IngredientUnit } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { showError, showSuccess } from '../../stores/toastStore';
import { canonicalizeSupplierName } from '../../services/suppliers';
import { cn, validateRange } from '../../utils';

const UNITS: IngredientUnit[] = ['kg', 'g', 'l', 'ml', 'unite'];

interface InlineIngredientFormProps {
  supplierQuickPicks: string[];
  onCreated: (ingredientId: string) => void;
  onCancel: () => void;
}

export default function InlineIngredientForm({ supplierQuickPicks, onCreated, onCancel }: InlineIngredientFormProps) {
  const addIngredient = useAppStore((s) => s.addIngredient);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<IngredientUnit>('kg');
  const [unitPrice, setUnitPrice] = useState('');
  const [conditioning, setConditioning] = useState('');
  const [supplier, setSupplier] = useState('');

  const handleSave = async () => {
    const trimmed = name.trim();
    const price = Number.parseFloat(unitPrice);
    if (!trimmed) {
      showError("Le nom de l'ingredient est obligatoire");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      showError('Le prix unitaire doit etre superieur a 0');
      return;
    }
    const priceErr = validateRange(price, 0, 99999, 'Le prix');
    if (priceErr) { showError(priceErr); return; }

    const id = crypto.randomUUID();
    const cq = Number.parseInt(conditioning, 10);
    if (cq > 1) {
      const cqErr = validateRange(cq, 0, 99999, 'Le colisage');
      if (cqErr) { showError(cqErr); return; }
    }
    const payload: Ingredient = {
      id,
      name: trimmed,
      unit,
      unitPrice: price,
      conditioningQuantity: cq > 1 ? cq : undefined,
      supplierId: supplier.trim() || undefined,
    };

    try {
      await addIngredient(payload);
      showSuccess('Ingredient cree');
      onCreated(id);
    } catch {
      showError("Impossible de creer l'ingredient");
    }
  };

  return (
    <div className="rounded-xl border border-[color:var(--app-accent)]/30 p-3 space-y-2">
      <p className="text-[12px] font-semibold app-accent">Nouvel ingredient</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom (ex: Farine T55)"
        className="w-full px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        autoFocus
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as IngredientUnit)}
          className="px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="0.0001"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="Prix achat"
          className="px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        />
        <input
          type="number"
          min="0"
          step="1"
          value={conditioning}
          onChange={(e) => setConditioning(e.target.value)}
          placeholder="Colisage"
          className="px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        />
      </div>
      {Number(conditioning) > 1 && Number(unitPrice) > 0 && (
        <p className="ios-small app-accent font-medium">
          Prix effectif: {(Number(unitPrice) / Number(conditioning)).toFixed(4)} EUR/{unit}
        </p>
      )}
      <input
        type="text"
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
        placeholder="Fournisseur (optionnel)"
        className="w-full px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
      />
      {supplierQuickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {supplierQuickPicks.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSupplier(canonicalizeSupplierName(s))}
              className={cn(
                'px-2 py-0.5 rounded-full ios-small font-semibold active:opacity-70',
                supplier.trim().toLowerCase() === s.toLowerCase() ? 'app-accent-bg' : 'app-surface-2 app-text',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => { void handleSave(); }}
          className="flex-1 py-2 rounded-lg app-accent-bg ios-caption font-semibold active:opacity-70"
        >
          Creer
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg app-surface-2 app-text ios-caption font-semibold active:opacity-70"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

