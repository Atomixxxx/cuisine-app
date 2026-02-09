import { useState } from 'react';
import type { Ingredient, RecipeUnit } from '../../types';
import { getEffectiveUnitPrice } from '../../services/recipeCost';
import { useAppStore } from '../../stores/appStore';
import { showSuccess } from '../../stores/toastStore';
import InlineIngredientForm from './InlineIngredientForm';

function money(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

const UNITS: RecipeUnit[] = ['kg', 'g', 'l', 'ml', 'unite'];

interface LineDraft {
  id: string;
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: RecipeUnit;
}

interface IngredientLineEditorProps {
  line: LineDraft;
  ingredients: Ingredient[];
  ingredientMap: Map<string, Ingredient>;
  supplierQuickPicks: string[];
  onUpdate: (lineId: string, patch: Partial<LineDraft>) => void;
  onRemove: (lineId: string) => void;
  onIngredientCreated: () => void;
}

export default function IngredientLineEditor({
  line,
  ingredients,
  ingredientMap,
  supplierQuickPicks,
  onUpdate,
  onRemove,
  onIngredientCreated,
}: IngredientLineEditorProps) {
  const [showNewIngredient, setShowNewIngredient] = useState(false);
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [editCond, setEditCond] = useState('');
  const updateIngredient = useAppStore((s) => s.updateIngredient);

  const ingredient = ingredientMap.get(line.ingredientId);
  const effectivePrice = ingredient ? getEffectiveUnitPrice(ingredient) : 0;
  const lineCost = ingredient
    ? line.requiredQuantity * effectivePrice
    : 0;

  const handleSelectChange = (value: string) => {
    if (value === '__new__') {
      setShowNewIngredient(true);
      return;
    }
    const ing = ingredientMap.get(value);
    onUpdate(line.id, {
      ingredientId: value,
      requiredUnit: ing?.unit || line.requiredUnit,
    });
  };

  const openEditPrice = () => {
    if (!ingredient) return;
    setEditPrice(String(ingredient.unitPrice));
    setEditCond(String(ingredient.conditioningQuantity || ''));
    setShowEditPrice(true);
  };

  const saveEditPrice = async () => {
    if (!ingredient) return;
    const price = parseFloat(editPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    const cq = parseInt(editCond, 10);
    const updated: Ingredient = {
      ...ingredient,
      unitPrice: price,
      conditioningQuantity: cq > 1 ? cq : undefined,
    };
    await updateIngredient(updated);
    onIngredientCreated(); // refresh ingredients list
    setShowEditPrice(false);
    showSuccess('Prix mis a jour');
  };

  return (
    <div className="p-3 rounded-xl app-surface-2 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={line.ingredientId}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        >
          <option value="">-- Choisir --</option>
          {ingredients.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name} ({money(getEffectiveUnitPrice(ing))}/{ing.unit})
            </option>
          ))}
          <option value="__new__">+ Nouvel ingredient...</option>
        </select>
        <button
          onClick={() => onRemove(line.id)}
          className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[color:var(--app-danger)] active:opacity-70"
          aria-label="Retirer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-[1fr,80px,auto] gap-2 items-center">
        <input
          type="number"
          min="0"
          step="0.001"
          value={line.requiredQuantity}
          onChange={(e) => onUpdate(line.id, { requiredQuantity: Number.parseFloat(e.target.value) || 0 })}
          placeholder="Quantite"
          className="px-3 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        />
        <select
          value={line.requiredUnit}
          onChange={(e) => onUpdate(line.id, { requiredUnit: e.target.value as RecipeUnit })}
          className="px-2 py-2.5 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <button
          onClick={openEditPrice}
          className="text-[13px] app-muted font-medium whitespace-nowrap active:opacity-70 underline decoration-dotted"
          title="Modifier le prix / colisage"
        >
          {lineCost > 0 ? money(lineCost) : ingredient ? money(0) : ''}
          {ingredient && ingredient.conditioningQuantity && ingredient.conditioningQuantity > 1 && (
            <span className="text-[10px] ml-1 app-accent">x{ingredient.conditioningQuantity}</span>
          )}
        </button>
      </div>

      {/* Edit price/conditioning inline */}
      {showEditPrice && ingredient && (
        <div className="rounded-xl border border-[color:var(--app-accent)]/30 p-3 space-y-2">
          <p className="text-[12px] font-semibold app-accent">Modifier {ingredient.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] app-muted">Prix d'achat</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] app-muted">Colisage (ex: 90)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={editCond}
                onChange={(e) => setEditCond(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 rounded-lg app-bg app-text text-[14px] border-0 focus:outline-none"
              />
            </div>
          </div>
          {Number(editCond) > 1 && Number(editPrice) > 0 && (
            <p className="text-[11px] app-accent font-medium">
              Prix effectif: {(Number(editPrice) / Number(editCond)).toFixed(4)} EUR/{ingredient.unit}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { void saveEditPrice(); }}
              className="flex-1 py-2 rounded-lg app-accent-bg text-[13px] font-semibold active:opacity-70"
            >
              Sauver
            </button>
            <button
              onClick={() => setShowEditPrice(false)}
              className="px-4 py-2 rounded-lg app-surface-3 app-text text-[13px] font-semibold active:opacity-70"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showNewIngredient && (
        <InlineIngredientForm
          supplierQuickPicks={supplierQuickPicks}
          onCreated={(newId) => {
            setShowNewIngredient(false);
            onUpdate(line.id, { ingredientId: newId });
            onIngredientCreated();
          }}
          onCancel={() => setShowNewIngredient(false)}
        />
      )}
    </div>
  );
}
