import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../../stores/appStore';
import type { ProductTrace } from '../../types';
import { PRODUCT_CATEGORIES } from '../../types';
import { cn, vibrate } from '../../utils';
import { showError } from '../../stores/toastStore';
import { useBadgeStore } from '../../stores/badgeStore';
import { generateTraceabilityPDF, generateTraceabilityCSV, downloadCSV } from '../../services/pdf';
import BarcodeScanner from '../../components/traceability/BarcodeScanner';
import ProductForm from '../../components/traceability/ProductForm';
import ProductGallery from '../../components/traceability/ProductGallery';
import { ProductCardSkeleton } from '../../components/common/Skeleton';
import ProductDetail from '../../components/traceability/ProductDetail';

type Tab = 'scanner' | 'history';
type ViewMode = 'grid' | 'list';
type ScannerStep = 'scan' | 'form';
const PAGE_SIZE = 50;

export default function Traceability() {
  const getProducts = useAppStore(s => s.getProducts);
  const addProduct = useAppStore(s => s.addProduct);
  const updateProduct = useAppStore(s => s.updateProduct);
  const deleteProduct = useAppStore(s => s.deleteProduct);
  const settings = useAppStore(s => s.settings);

  const [activeTab, setActiveTab] = useState<Tab>('scanner');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [products, setProducts] = useState<ProductTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);

  // Scanner state
  const [scannerStep, setScannerStep] = useState<ScannerStep>('scan');
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>();
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | undefined>();

  // Detail state
  const [selectedProduct, setSelectedProduct] = useState<ProductTrace | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductTrace | null>(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const refreshBadges = useBadgeStore(s => s.refreshBadges);

  const loadInitialProducts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getProducts({ limit: PAGE_SIZE, offset: 0 });
      setProducts(list);
      setPage(1);
      setHasMoreProducts(list.length === PAGE_SIZE);
      refreshBadges();
    } catch {
      showError('Impossible de charger les produits');
    } finally {
      setLoading(false);
    }
  }, [getProducts, refreshBadges]);

  useEffect(() => {
    loadInitialProducts();
  }, [loadInitialProducts]);

  const loadMoreProducts = useCallback(async () => {
    if (loading || loadingMore || !hasMoreProducts) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const list = await getProducts({
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      });
      setProducts((prev) => [...prev, ...list]);
      setPage(nextPage);
      setHasMoreProducts(list.length === PAGE_SIZE);
    } catch {
      showError('Impossible de charger plus de produits');
    } finally {
      setLoadingMore(false);
    }
  }, [getProducts, hasMoreProducts, loading, loadingMore, page]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    const quick = searchParams.get('quick');
    let changed = false;

    if (requestedTab === 'history' || requestedTab === 'scanner') {
      setActiveTab(requestedTab);
      if (requestedTab === 'scanner') setScannerStep('scan');
      changed = true;
    }

    if (quick === 'scan') {
      setActiveTab('scanner');
      setScannerStep('scan');
      changed = true;
    }

    if (!changed) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tab');
    nextParams.delete('quick');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Derived: unique suppliers
  const suppliers = useMemo(() => {
    const set = new Set(products.map((p) => p.supplier));
    return Array.from(set).sort();
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const allergenText = (p.allergens ?? []).join(' ').toLowerCase();
        const match =
          p.productName.toLowerCase().includes(q) ||
          p.supplier.toLowerCase().includes(q) ||
          p.lotNumber.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          allergenText.includes(q);
        if (!match) return false;
      }
      if (filterCategory && p.category !== filterCategory) return false;
      if (filterSupplier && p.supplier !== filterSupplier) return false;
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(p.receptionDate) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(p.receptionDate) > to) return false;
      }
      return true;
    });
  }, [products, searchText, filterCategory, filterSupplier, dateFrom, dateTo]);

  const urgentProducts = useMemo(
    () =>
      filteredProducts.filter((product) => {
        const daysLeft = differenceInDays(new Date(product.expirationDate), new Date());
        return daysLeft <= 3;
      }).length,
    [filteredProducts],
  );

  // Handlers
  const handleScanComplete = useCallback((barcode: string | undefined, photo: Blob | undefined) => {
    setScannedBarcode(barcode);
    setCapturedPhoto(photo);
    setScannerStep('form');
  }, []);

  const handleSaveProduct = useCallback(
    async (product: ProductTrace) => {
      try {
        await addProduct(product);
        vibrate(50);
        setScannerStep('scan');
        setScannedBarcode(undefined);
        setCapturedPhoto(undefined);
        await loadInitialProducts();
      } catch {
        showError('Impossible de sauvegarder le produit');
      }
    },
    [addProduct, loadInitialProducts]
  );

  const handleCancelForm = useCallback(() => {
    setScannerStep('scan');
    setScannedBarcode(undefined);
    setCapturedPhoto(undefined);
  }, []);

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      try {
        await deleteProduct(id);
        await loadInitialProducts();
      } catch {
        showError('Impossible de supprimer le produit');
      }
    },
    [deleteProduct, loadInitialProducts]
  );

  const handleEditProduct = useCallback((product: ProductTrace) => {
    setSelectedProduct(null);
    setEditingProduct(product);
  }, []);

  const handleUpdateProduct = useCallback(
    async (product: ProductTrace) => {
      try {
        await updateProduct(product);
        setEditingProduct(null);
        await loadInitialProducts();
      } catch {
        showError('Impossible de modifier le produit');
      }
    },
    [updateProduct, loadInitialProducts]
  );

  const handleExportPDF = useCallback(() => {
    const label = dateFrom || dateTo
      ? `${dateFrom || '...'} - ${dateTo || '...'}`
      : 'Toutes les dates';
    generateTraceabilityPDF(filteredProducts, settings?.establishmentName ?? '', label);
  }, [filteredProducts, settings, dateFrom, dateTo]);

  const handleExportCSV = useCallback(() => {
    const csv = generateTraceabilityCSV(filteredProducts);
    downloadCSV(csv, `tracabilite_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }, [filteredProducts]);

  return (
    <div className="flex flex-col h-full app-bg app-page-wrap pb-24">
      <div className="app-hero-card space-y-3">
        <div>
          <h1 className="ios-title app-text">Tracabilite</h1>
          <p className="text-[15px] app-muted">Lots, DLC et historique des produits.</p>
        </div>
        <div className="app-kpi-grid">
          <div className="app-kpi-card">
            <p className="app-kpi-label">Produits charges</p>
            <p className="app-kpi-value">{products.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Resultats filtres</p>
            <p className="app-kpi-value">{filteredProducts.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">DLC critiques</p>
            <p className="app-kpi-value">{urgentProducts}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Fournisseurs</p>
            <p className="app-kpi-value">{suppliers.length}</p>
          </div>
        </div>
      </div>

      <div className="ios-segmented">
        <button
          onClick={() => setActiveTab('scanner')}
          className={cn('ios-segmented-item', activeTab === 'scanner' && 'active')}
        >
          Scanner
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn('ios-segmented-item', activeTab === 'history' && 'active')}
        >
          Historique
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'scanner' && (
          <div className="py-2">
            {scannerStep === 'scan' ? (
              <BarcodeScanner
                onScanComplete={handleScanComplete}
                onCancel={() => setActiveTab('history')}
              />
            ) : (
              <ProductForm
                barcode={scannedBarcode}
                photo={capturedPhoto}
                onSave={handleSaveProduct}
                onCancel={handleCancelForm}
              />
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex flex-col gap-3 py-2">
            {/* Export buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleExportPDF}
                disabled={filteredProducts.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 app-accent-bg rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:opacity-70 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </button>
              <button
                onClick={handleExportCSV}
                disabled={filteredProducts.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 app-success-bg rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:opacity-70 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV
              </button>

              <div className="flex-1" />

              {/* View toggle */}
              <div className="flex items-center app-surface-2 rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    viewMode === 'grid'
                      ? 'app-surface text-[color:var(--app-accent)] shadow-sm'
                      : 'app-muted'
                  )}
                  aria-label="Vue grille"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    viewMode === 'list'
                      ? 'app-surface text-[color:var(--app-accent)] shadow-sm'
                      : 'app-muted'
                  )}
                  aria-label="Vue liste"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-2 p-3 rounded-2xl app-panel">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Rechercher produit, fournisseur, lot, allergene..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl app-surface-2 app-text placeholder-[color:var(--app-muted)] text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Category */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                >
                  <option value="">Toutes catégories</option>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Supplier */}
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                >
                  <option value="">Tous fournisseurs</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="Du"
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="Au"
                  className="px-3 py-2.5 rounded-xl app-surface-2 app-text text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
                />
              </div>

              {/* Active filter count */}
              {(searchText || filterCategory || filterSupplier || dateFrom || dateTo) && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] app-muted">
                    {filteredProducts.length} résultat{filteredProducts.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => {
                      setSearchText('');
                      setFilterCategory('');
                      setFilterSupplier('');
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-[13px] text-[color:var(--app-accent)] font-medium active:opacity-70"
                  >
                    Effacer les filtres
                  </button>
                </div>
              )}
            </div>

            {/* Products display */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : viewMode === 'grid' ? (
              <ProductGallery
                products={filteredProducts}
                onSelect={(p) => setSelectedProduct(p)}
                onDelete={handleDeleteProduct}
              />
            ) : (
                <ProductListView
                  products={filteredProducts}
                  onSelect={(p) => setSelectedProduct(p)}
                  onDelete={handleDeleteProduct}
                />
            )}

            {!loading && hasMoreProducts && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => {
                    void loadMoreProducts();
                  }}
                  disabled={loadingMore}
                  className={cn(
                    'px-4 py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70 transition-opacity',
                    loadingMore ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-surface-2 app-text',
                  )}
                >
                  {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product detail modal */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          products={filteredProducts}
          onClose={() => setSelectedProduct(null)}
          onDelete={(id) => {
            handleDeleteProduct(id);
            setSelectedProduct(null);
          }}
          onEdit={handleEditProduct}
          onNavigate={(p) => setSelectedProduct(p)}
        />
      )}

      {/* Edit product modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex flex-col app-bg">
          <div className="flex items-center justify-between px-4 py-3 app-header hairline-b">
            <h2 className="ios-title3 app-text">Modifier le produit</h2>
            <button
              onClick={() => setEditingProduct(null)}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full app-surface-2 app-muted active:opacity-70"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ProductForm
              existingProduct={editingProduct}
              onSave={handleUpdateProduct}
              onCancel={() => setEditingProduct(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── List View (inline sub-component) ── */

function ProductListView({
  products,
  onSelect,
  onDelete,
}: {
  products: ProductTrace[];
  onSelect: (p: ProductTrace) => void;
  onDelete: (id: string) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="w-16 h-16 app-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p className="ios-title3 app-muted">Aucun produit enregistré</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {products.map((product) => {
        const days = differenceInDays(new Date(product.expirationDate), new Date());
        const dlcColor =
          days < 0
            ? 'text-[color:var(--app-danger)]'
            : days <= 3
            ? 'text-[color:var(--app-warning)]'
            : 'text-[color:var(--app-success)]';

        return (
          <div
            key={product.id}
            onClick={() => onSelect(product)}
            className="flex items-center gap-3 p-3.5 rounded-2xl app-card cursor-pointer active:opacity-70 transition-opacity"
          >
            {/* Icon */}
            <div className="flex-shrink-0 w-10 h-10 rounded-xl app-surface-2 flex items-center justify-center">
              <svg className="w-5 h-5 app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-semibold app-text truncate">
                {product.productName}
              </h3>
              <p className="text-[13px] app-muted truncate">
                {product.supplier} &middot; Lot {product.lotNumber}
              </p>
            </div>

            {/* DLC + category */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="px-2 py-0.5 text-[12px] font-medium rounded-full app-chip">
                {product.category}
              </span>
              <span className={cn('text-[12px] font-medium', dlcColor)}>
                {format(new Date(product.expirationDate), 'dd/MM/yy', { locale: fr })}
              </span>
            </div>

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product.id);
              }}
              className="flex-shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl app-muted active:opacity-70 transition-opacity"
              aria-label="Supprimer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}


