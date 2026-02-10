import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ProductTrace } from '../../types';
import Traceability from './index';

const { mockStore, mockRefreshBadges } = vi.hoisted(() => {
  const getProducts = vi.fn();
  const getLatestProductByBarcode = vi.fn();
  const addProduct = vi.fn();
  const updateProduct = vi.fn();
  const markProductAsUsed = vi.fn();
  const deleteProduct = vi.fn();
  const refreshBadges = vi.fn();

  const store = {
    getProducts,
    getLatestProductByBarcode,
    addProduct,
    updateProduct,
    markProductAsUsed,
    deleteProduct,
    settings: { establishmentName: 'Cuisine Test' },
  };

  return {
    mockStore: store,
    mockRefreshBadges: refreshBadges,
  };
});

vi.mock('../../stores/appStore', () => ({
  useAppStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

vi.mock('../../stores/badgeStore', () => ({
  useBadgeStore: (selector: (state: { refreshBadges: typeof mockRefreshBadges }) => unknown) =>
    selector({ refreshBadges: mockRefreshBadges }),
}));

vi.mock('../../stores/toastStore', () => ({
  showError: vi.fn(),
}));

vi.mock('../../services/pdf', () => ({
  generateTraceabilityPDF: vi.fn(),
  generateTraceabilityCSV: vi.fn(() => 'csv'),
  downloadCSV: vi.fn(),
}));

vi.mock('../../services/ocr', () => ({
  hasApiKey: vi.fn().mockResolvedValue(false),
  analyzeLabelImage: vi.fn(),
}));

vi.mock('../../services/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../components/traceability/BarcodeScanner', () => ({
  default: () => <div data-testid="barcode-scanner">scanner</div>,
}));

vi.mock('../../components/traceability/ProductGallery', () => ({
  default: ({ products }: { products: ProductTrace[] }) => (
    <div data-testid="product-gallery-mock">
      {products.map((product) => (
        <div key={product.id}>{product.productName}</div>
      ))}
    </div>
  ),
}));

describe('Traceability page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const products: ProductTrace[] = [
      {
        id: 'p-active',
        status: 'active',
        productName: 'Poulet actif',
        supplier: 'Metro',
        lotNumber: 'LOT-A',
        receptionDate: new Date('2026-01-01'),
        expirationDate: new Date('2026-01-10'),
        category: 'Viande',
        scannedAt: new Date('2026-01-01'),
      },
      {
        id: 'p-used',
        status: 'used',
        usedAt: new Date('2026-01-03'),
        productName: 'Poisson utilise',
        supplier: 'Pomona',
        lotNumber: 'LOT-U',
        receptionDate: new Date('2026-01-01'),
        expirationDate: new Date('2026-01-04'),
        category: 'Poisson',
        scannedAt: new Date('2026-01-01'),
      },
    ];

    mockStore.getProducts.mockResolvedValue(products);
    mockStore.getLatestProductByBarcode.mockResolvedValue(null);
    mockStore.addProduct.mockResolvedValue(undefined);
    mockStore.updateProduct.mockResolvedValue(undefined);
    mockStore.markProductAsUsed.mockResolvedValue(undefined);
    mockStore.deleteProduct.mockResolvedValue(undefined);
  });

  it('hides used products by default and shows them when history toggle is enabled', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/traceability']}>
        <Routes>
          <Route path="/traceability" element={<Traceability />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockStore.getProducts).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /historique/i }));
    await user.click(screen.getByRole('button', { name: /vue liste/i }));

    expect(screen.getByText('Poulet actif')).toBeInTheDocument();
    expect(screen.queryByText('Poisson utilise')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /afficher les produits utilises/i }));

    await waitFor(() => {
      expect(screen.getByText('Poisson utilise')).toBeInTheDocument();
    });
  });
});
