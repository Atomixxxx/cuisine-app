import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../services/db';
import { cn, normalizeKeyPart } from '../../utils';
import type { Equipment, Ingredient, Invoice, Order, ProductTrace, Recipe, Task } from '../../types';
import { useCommandPalette } from '../../hooks/useCommandPalette';

type CommandKind = 'action' | 'recipe' | 'product' | 'task' | 'order' | 'invoice' | 'ingredient' | 'equipment';

interface CommandItem {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle?: string;
  route: string;
}

interface CommandSection {
  key: string;
  label: string;
  items: CommandItem[];
}

interface SearchableData {
  recipes: Recipe[];
  products: ProductTrace[];
  tasks: Task[];
  orders: Order[];
  invoices: Invoice[];
  ingredients: Ingredient[];
  equipment: Equipment[];
}

const MAX_RESULTS_PER_SECTION = 5;

const QUICK_ACTIONS: CommandItem[] = [
  { id: 'quick-scan-product', kind: 'action', title: 'Scanner un produit', subtitle: 'Ouvrir le scanner', route: '/traceability?tab=scanner&quick=scan' },
  { id: 'quick-new-task', kind: 'action', title: 'Nouvelle tache', subtitle: 'Creer une tache', route: '/tasks?quick=new' },
  { id: 'quick-temp-input', kind: 'action', title: 'Saisir temperature', subtitle: 'Saisie rapide', route: '/temperature?quick=input' },
  { id: 'quick-scan-invoice', kind: 'action', title: 'Scanner une facture', subtitle: 'Lancer OCR facture', route: '/invoices?quick=scan' },
  { id: 'quick-dashboard', kind: 'action', title: 'Dashboard', subtitle: 'Vue principale', route: '/dashboard' },
  { id: 'quick-analytics', kind: 'action', title: 'Analytics', subtitle: 'Statistiques', route: '/analytics' },
  { id: 'quick-settings', kind: 'action', title: 'Parametres', subtitle: 'Configuration', route: '/settings' },
  { id: 'quick-assistant', kind: 'action', title: 'Agent IA', subtitle: 'Assistant conversationnel', route: '/assistant' },
];

const EMPTY_DATA: SearchableData = {
  recipes: [],
  products: [],
  tasks: [],
  orders: [],
  invoices: [],
  ingredients: [],
  equipment: [],
};

function iconForKind(kind: CommandKind) {
  switch (kind) {
    case 'recipe':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7V4z" />
          <path d="M7 4H6a2 2 0 00-2 2v12a2 2 0 002 2h1M10 9h6M10 13h6" />
        </svg>
      );
    case 'product':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
        </svg>
      );
    case 'task':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case 'order':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6h15l-1.5 8.5H8.2L6 6z" />
          <path d="M6 6L5 3H2" />
        </svg>
      );
    case 'invoice':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case 'ingredient':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20v-8" />
          <path d="M12 12c0-3.5 3-6 6-6 0 3.5-2.5 6-6 6z" />
          <path d="M12 12c0-3.5-3-6-6-6 0 3.5 2.5 6 6 6z" />
        </svg>
      );
    case 'equipment':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 14.76V3.5a2 2 0 10-4 0v11.26a4 4 0 104 0z" />
        </svg>
      );
    case 'action':
    default:
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 3L4 14h6l-1 7 7-11h-6l1-7z" />
        </svg>
      );
  }
}

function matchesQuery(query: string, ...values: Array<string | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => normalizeKeyPart(value ?? '').includes(query));
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const close = useCommandPalette((s) => s.close);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [data, setData] = useState<SearchableData>(EMPTY_DATA);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      db.recipes.toArray(),
      db.productTraces.toArray(),
      db.tasks.toArray(),
      db.orders.toArray(),
      db.invoices.toArray(),
      db.ingredients.toArray(),
      db.equipment.toArray(),
    ])
      .then(([recipes, products, tasks, orders, invoices, ingredients, equipment]) => {
        if (cancelled) return;
        setData({
          recipes,
          products,
          tasks: tasks.filter((task) => !task.archived),
          orders,
          invoices,
          ingredients,
          equipment,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = useMemo(() => normalizeKeyPart(query), [query]);
  const hasQuery = normalizedQuery.length > 0;

  const actionItems = useMemo(() => {
    if (!hasQuery) return QUICK_ACTIONS;
    return QUICK_ACTIONS.filter((item) => matchesQuery(normalizedQuery, item.title, item.subtitle));
  }, [hasQuery, normalizedQuery]);

  const recipeItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.recipes
            .filter((recipe) => matchesQuery(normalizedQuery, recipe.title))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((recipe) => ({
              id: `recipe-${recipe.id}`,
              kind: 'recipe',
              title: recipe.title,
              subtitle: 'Recette',
              route: '/recipes',
            }))
        : [],
    [data.recipes, hasQuery, normalizedQuery],
  );

  const productItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.products
            .filter((product) => matchesQuery(normalizedQuery, product.productName, product.supplier, product.barcode))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((product) => ({
              id: `product-${product.id}`,
              kind: 'product',
              title: product.productName,
              subtitle: [product.supplier, product.barcode].filter(Boolean).join(' - '),
              route: '/traceability?tab=history',
            }))
        : [],
    [data.products, hasQuery, normalizedQuery],
  );

  const taskItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.tasks
            .filter((task) => matchesQuery(normalizedQuery, task.title))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((task) => ({
              id: `task-${task.id}`,
              kind: 'task',
              title: task.title,
              subtitle: 'Tache',
              route: '/tasks',
            }))
        : [],
    [data.tasks, hasQuery, normalizedQuery],
  );

  const orderItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.orders
            .filter((order) => matchesQuery(normalizedQuery, order.orderNumber, order.supplier))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((order) => ({
              id: `order-${order.id}`,
              kind: 'order',
              title: order.orderNumber,
              subtitle: order.supplier,
              route: '/orders',
            }))
        : [],
    [data.orders, hasQuery, normalizedQuery],
  );

  const invoiceItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.invoices
            .filter((invoice) => matchesQuery(normalizedQuery, invoice.supplier, invoice.invoiceNumber))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((invoice) => ({
              id: `invoice-${invoice.id}`,
              kind: 'invoice',
              title: invoice.supplier,
              subtitle: `Facture ${invoice.invoiceNumber}`,
              route: '/invoices',
            }))
        : [],
    [data.invoices, hasQuery, normalizedQuery],
  );

  const ingredientItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.ingredients
            .filter((ingredient) => matchesQuery(normalizedQuery, ingredient.name))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((ingredient) => ({
              id: `ingredient-${ingredient.id}`,
              kind: 'ingredient',
              title: ingredient.name,
              subtitle: 'Ingredient',
              route: '/recipes',
            }))
        : [],
    [data.ingredients, hasQuery, normalizedQuery],
  );

  const equipmentItems = useMemo<CommandItem[]>(
    () =>
      hasQuery
        ? data.equipment
            .filter((equipment) => matchesQuery(normalizedQuery, equipment.name))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map((equipment) => ({
              id: `equipment-${equipment.id}`,
              kind: 'equipment',
              title: equipment.name,
              subtitle: 'Equipement',
              route: '/temperature',
            }))
        : [],
    [data.equipment, hasQuery, normalizedQuery],
  );

  const sections = useMemo<CommandSection[]>(() => {
    const nextSections: CommandSection[] = [];

    if (actionItems.length > 0) {
      nextSections.push({
        key: 'actions',
        label: 'ACTIONS RAPIDES',
        items: actionItems,
      });
    }

    if (!hasQuery) return nextSections;

    if (recipeItems.length > 0) nextSections.push({ key: 'recipes', label: 'RECETTES', items: recipeItems });
    if (productItems.length > 0) nextSections.push({ key: 'products', label: 'PRODUITS', items: productItems });
    if (taskItems.length > 0) nextSections.push({ key: 'tasks', label: 'TACHES', items: taskItems });
    if (orderItems.length > 0) nextSections.push({ key: 'orders', label: 'COMMANDES', items: orderItems });
    if (invoiceItems.length > 0) nextSections.push({ key: 'invoices', label: 'FACTURES', items: invoiceItems });
    if (ingredientItems.length > 0) nextSections.push({ key: 'ingredients', label: 'INGREDIENTS', items: ingredientItems });
    if (equipmentItems.length > 0) nextSections.push({ key: 'equipment', label: 'EQUIPEMENTS', items: equipmentItems });

    return nextSections;
  }, [actionItems, equipmentItems, hasQuery, ingredientItems, invoiceItems, orderItems, productItems, recipeItems, taskItems]);

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeIndex = flatItems.length === 0 ? -1 : Math.min(selectedIndex, flatItems.length - 1);

  const executeItem = useCallback(
    (item: CommandItem) => {
      close();
      navigate(item.route);
    },
    [close, navigate],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
          return;
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (flatItems.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          const current = ((prev % flatItems.length) + flatItems.length) % flatItems.length;
          return (current + 1) % flatItems.length;
        });
        inputRef.current?.focus();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          const current = ((prev % flatItems.length) + flatItems.length) % flatItems.length;
          return (current - 1 + flatItems.length) % flatItems.length;
        });
        inputRef.current?.focus();
        return;
      }

      if (event.key === 'Enter') {
        const activeItem = activeIndex >= 0 ? flatItems[activeIndex] : null;
        if (!activeItem) return;
        event.preventDefault();
        executeItem(activeItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIndex, close, executeItem, flatItems]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px] p-2 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" className="w-full max-w-xl mx-auto mt-[10vh] rounded-2xl glass-card glass-modal animate-slide-up overflow-hidden">
        <div className="p-3 border-b app-border">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Rechercher..."
            className="w-full min-h-[44px] rounded-xl app-surface-2 app-text px-3 text-[17px] placeholder-[color:var(--app-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {sections.map((section) => (
            <div key={section.key} className="pb-2">
              <p className="px-2 pt-2 pb-1 ios-caption-upper">{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const index = flatItems.findIndex((flatItem) => flatItem.id === item.id);
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => {
                        setSelectedIndex(index);
                      }}
                      onClick={() => executeItem(item)}
                      className={cn(
                        'w-full min-h-[44px] rounded-xl px-3 py-2 text-left flex items-center gap-3 transition-colors',
                        isActive ? 'bg-[color:var(--app-accent-weak)]' : 'hover:bg-[color:var(--app-surface-2)]',
                      )}
                    >
                      <span className="w-8 h-8 rounded-lg app-surface-2 app-muted inline-flex items-center justify-center shrink-0">
                        {iconForKind(item.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold app-text truncate">{item.title}</span>
                        {item.subtitle && <span className="block ios-small app-muted truncate">{item.subtitle}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {flatItems.length === 0 && !loading && (
            <p className="dash-empty-inline">Aucun resultat.</p>
          )}

          {loading && <p className="dash-empty-inline">Chargement...</p>}
        </div>
      </div>
    </div>
  );
}
