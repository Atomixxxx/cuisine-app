import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskForm from './TaskForm';

describe('TaskForm', () => {
  const defaultProps = {
    onSave: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
  };

  it('renders title input and action buttons', () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByPlaceholderText(/sauce béarnaise/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /annuler/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter/i })).toBeInTheDocument();
  });

  it('shows error on empty title submit', async () => {
    render(<TaskForm {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    await waitFor(() => {
      expect(screen.getByText(/titre est requis/i)).toBeInTheDocument();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with task data', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TaskForm onSave={onSave} onCancel={vi.fn()} />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/sauce béarnaise/i), 'Faire les stocks');
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0][0].title).toBe('Faire les stocks');
    expect(onSave.mock.calls[0][0].priority).toBe('normal');
  });

  it('has dialog role and aria attributes', () => {
    render(<TaskForm {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'taskform-title');
  });

  it('priority buttons toggle correctly', () => {
    render(<TaskForm {...defaultProps} />);
    const highBtn = screen.getByRole('button', { name: /haute/i });
    expect(highBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(highBtn);
    expect(highBtn).toHaveAttribute('aria-pressed', 'true');

    const normalBtn = screen.getByRole('button', { name: /normale/i });
    expect(normalBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('recurring buttons toggle correctly', () => {
    render(<TaskForm {...defaultProps} />);
    const dailyBtn = screen.getByRole('button', { name: /quotidienne/i });
    expect(dailyBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(dailyBtn);
    expect(dailyBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows "Enregistrer" when editing an existing task', () => {
    render(
      <TaskForm
        task={{
          id: '1',
          title: 'Existing Task',
          category: 'autre',
          priority: 'high',
          completed: false,
          recurring: null,
          createdAt: new Date(),
          archived: false,
          order: 0,
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing Task')).toBeInTheDocument();
  });

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn();
    render(<TaskForm onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
