import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductForm from './ProductForm';

describe('ProductForm', () => {
  const defaultProps = {
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders all required fields', () => {
    render(<ProductForm {...defaultProps} />);
    expect(screen.getByPlaceholderText(/filet de saumon/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/pomona/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/lot-2024/i)).toBeInTheDocument();
    expect(screen.getByText(/date de réception/i)).toBeInTheDocument();
    expect(screen.getByText(/dlc/i)).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    render(<ProductForm {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: /enregistrer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/nom du produit requis/i)).toBeInTheDocument();
      expect(screen.getByText(/fournisseur requis/i)).toBeInTheDocument();
      expect(screen.getByText(/numéro de lot requis/i)).toBeInTheDocument();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with valid data', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm onSave={onSave} onCancel={vi.fn()} />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/filet de saumon/i), 'Beurre');
    await user.type(screen.getByPlaceholderText(/pomona/i), 'Metro');
    await user.type(screen.getByPlaceholderText(/lot-2024/i), 'LOT-001');
    await user.click(screen.getByRole('button', { name: /gluten/i }));

    // Set expiration date — query by input type since label association is implicit
    const dateInputs = screen.getAllByDisplayValue('');
    const expirationInput = dateInputs.find(el => el.getAttribute('type') === 'date' && el.getAttribute('value') === '');
    if (expirationInput) {
      fireEvent.change(expirationInput, { target: { value: '2026-12-31' } });
    }

    const submitBtn = screen.getByRole('button', { name: /enregistrer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedProduct = onSave.mock.calls[0][0];
    expect(savedProduct.productName).toBe('Beurre');
    expect(savedProduct.supplier).toBe('Metro');
    expect(savedProduct.lotNumber).toBe('LOT-001');
    expect(savedProduct.allergens).toEqual(['Gluten']);
  });

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<ProductForm onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pre-fills form from scanner suggestions', () => {
    render(
      <ProductForm
        prefill={{
          productName: 'Yaourt nature',
          supplier: 'Metro',
          lotNumber: 'LOT-X9',
          category: 'Produits laitiers',
          allergens: ['Lait'],
          expirationDate: new Date(2026, 2, 5),
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('Yaourt nature')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Metro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('LOT-X9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Produits laitiers')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-03-05')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lait' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pre-fills form when editing existing product', () => {
    render(
      <ProductForm
        existingProduct={{
          id: '1',
          status: 'active',
          productName: 'Saumon',
          supplier: 'Pomona',
          lotNumber: 'LOT-99',
          category: 'Poisson',
          allergens: ['Poissons', 'Mollusques'],
          receptionDate: new Date('2026-01-15'),
          expirationDate: new Date('2026-02-15'),
          scannedAt: new Date(),
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('Saumon')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pomona')).toBeInTheDocument();
    expect(screen.getByDisplayValue('LOT-99')).toBeInTheDocument();
    expect(screen.getByText(/poissons, mollusques/i)).toBeInTheDocument();
  });

  it('has aria-required on required inputs', () => {
    render(<ProductForm {...defaultProps} />);
    expect(screen.getByPlaceholderText(/filet de saumon/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByPlaceholderText(/pomona/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByPlaceholderText(/lot-2024/i)).toHaveAttribute('aria-required', 'true');
  });
});
