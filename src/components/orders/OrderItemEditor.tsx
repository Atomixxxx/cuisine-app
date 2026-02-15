import type { IngredientUnit, OrderItem } from '../../types';

const UNITS: IngredientUnit[] = ['kg', 'g', 'l', 'ml', 'unite'];

interface OrderItemEditorProps {
  index: number;
  item: OrderItem;
  canRemove: boolean;
  ingredientSuggestions: string[];
  onChange: (patch: Partial<OrderItem>) => void;
  onRemove: () => void;
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function OrderItemEditor({
  index,
  item,
  canRemove,
  ingredientSuggestions,
  onChange,
  onRemove,
}: OrderItemEditorProps) {
  const listId = `order-item-suggestions-${index}`;
  const lineTotal = Math.round(item.quantity * (item.unitPriceHT ?? 0) * 100) / 100;

  return (
    <div className="p-3 rounded-xl app-surface-2 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <label className="block text-[10px] app-muted mb-1">Produit</label>
          <input
            type="text"
            value={item.productName}
            onChange={(e) => onChange({ productName: e.target.value })}
            className="app-input w-full"
            placeholder="Nom du produit"
            list={listId}
          />
          <datalist id={listId}>
            {ingredientSuggestions.map((name) => (
              <option key={`${listId}-${name}`} value={name} />
            ))}
          </datalist>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="mt-5 min-h-[36px] px-2 rounded-lg text-[color:var(--app-danger)] disabled:opacity-35 disabled:cursor-not-allowed"
          aria-label={`Supprimer l'article ${index + 1}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-[1fr,90px,1fr] gap-2">
        <div>
          <label className="block text-[10px] app-muted mb-1">Quantite</label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={item.quantity}
            onChange={(e) => {
              const quantity = toNumber(e.target.value);
              onChange({
                quantity,
                totalPriceHT: Math.round(quantity * (item.unitPriceHT ?? 0) * 100) / 100,
              });
            }}
            className="app-input w-full"
          />
        </div>
        <div>
          <label className="block text-[10px] app-muted mb-1">Unite</label>
          <select
            value={item.unit}
            onChange={(e) => onChange({ unit: e.target.value as IngredientUnit })}
            className="app-input w-full"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] app-muted mb-1">Prix unit. HT</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.unitPriceHT ?? 0}
            onChange={(e) => {
              const unitPriceHT = toNumber(e.target.value);
              onChange({
                unitPriceHT,
                totalPriceHT: Math.round(item.quantity * unitPriceHT * 100) / 100,
              });
            }}
            className="app-input w-full"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={item.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="app-input flex-1"
          placeholder="Note (optionnelle)"
        />
        <span className="text-xs font-semibold app-text whitespace-nowrap">
          {lineTotal.toFixed(2)} EUR HT
        </span>
      </div>
    </div>
  );
}
