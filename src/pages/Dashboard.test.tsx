import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { ProductTrace, Task, TemperatureRecord } from '../types';

const {
  mockStore,
  mockBuildSmartAlerts,
  mockShowError,
} = vi.hoisted(() => {
  const loadEquipment = vi.fn();
  const getTemperatureRecords = vi.fn();
  const getTasks = vi.fn();
  const getProducts = vi.fn();
  const showError = vi.fn();
  const buildSmartAlerts = vi.fn();

  const store = {
    equipment: [] as Array<{ id: string; name: string; type: 'fridge' | 'freezer' | 'cold_room'; minTemp: number; maxTemp: number; order: number }>,
    settings: { establishmentName: 'Cuisine Test' },
    loadEquipment,
    getTemperatureRecords,
    getTasks,
    getProducts,
  };

  return {
    mockStore: store,
    mockBuildSmartAlerts: buildSmartAlerts,
    mockShowError: showError,
  };
});

vi.mock('../stores/appStore', () => ({
  useAppStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

vi.mock('../services/smartAlerts', () => ({
  buildSmartAlerts: (...args: unknown[]) => mockBuildSmartAlerts(...args),
}));

vi.mock('../stores/toastStore', () => ({
  showError: (...args: unknown[]) => mockShowError(...args),
}));

vi.mock('../hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({
    canShow: false,
    install: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockStore.equipment = [
      { id: 'eq-1', name: 'Frigo 1', type: 'fridge', minTemp: 0, maxTemp: 4, order: 0 },
      { id: 'eq-2', name: 'Frigo 2', type: 'fridge', minTemp: 0, maxTemp: 4, order: 1 },
    ];
    mockStore.settings = { establishmentName: 'Cuisine Test' };

    const todayRecords: TemperatureRecord[] = [
      {
        id: 'temp-1',
        equipmentId: 'eq-1',
        temperature: 3,
        timestamp: new Date(),
        isCompliant: true,
      },
    ];
    const tasks: Task[] = [
      {
        id: 'task-1',
        title: 'Verifier DLC',
        category: 'autre',
        priority: 'normal',
        completed: false,
        recurring: null,
        createdAt: new Date(),
        archived: false,
        order: 0,
      },
    ];
    const products: ProductTrace[] = [
      {
        id: 'p-active',
        status: 'active',
        productName: 'Yaourt actif',
        supplier: 'Metro',
        lotNumber: 'LOT-A',
        receptionDate: new Date(),
        expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        category: 'Produits laitiers',
        scannedAt: new Date(),
      },
      {
        id: 'p-used',
        status: 'used',
        usedAt: new Date(),
        productName: 'Lait utilise',
        supplier: 'Metro',
        lotNumber: 'LOT-U',
        receptionDate: new Date(),
        expirationDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        category: 'Produits laitiers',
        scannedAt: new Date(),
      },
    ];

    mockStore.loadEquipment.mockResolvedValue(undefined);
    mockStore.getTemperatureRecords.mockResolvedValue(todayRecords);
    mockStore.getTasks.mockResolvedValue(tasks);
    mockStore.getProducts.mockResolvedValue(products);

    mockBuildSmartAlerts.mockReturnValue([
      {
        id: 'task-warning',
        severity: 'warning',
        title: 'Tache en attente',
        description: 'Une action est requise.',
        path: '/tasks',
      },
    ]);
  });

  it('excludes used products from expiring list', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockStore.getProducts).toHaveBeenCalled());

    expect(screen.getByText('Yaourt actif')).toBeInTheDocument();
    expect(screen.queryByText('Lait utilise')).not.toBeInTheDocument();
  });

  it('opens notifications tab and redirects when clicking an alert', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<div>TASKS_PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockBuildSmartAlerts).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /notifs/i }));
    await user.click(screen.getByRole('button', { name: /tache en attente/i }));

    await waitFor(() => {
      expect(screen.getByText('TASKS_PAGE')).toBeInTheDocument();
    });
  });
});
