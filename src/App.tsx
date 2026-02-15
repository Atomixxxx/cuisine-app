import { Component, Suspense, lazy } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/common/Layout";
import ToastContainer from "./components/common/ToastContainer";
import PinLockScreen from "./components/security/PinLockScreen";
import SectionErrorBoundary from "./components/common/SectionErrorBoundary";
import { logger } from "./services/logger";

/* Lazy-loaded page components */
const TemperaturePage = lazy(() => import("./pages/Temperature"));
const TraceabilityPage = lazy(() => import("./pages/Traceability"));
const TasksPage = lazy(() => import("./pages/Tasks"));
const InvoicesPage = lazy(() => import("./pages/Invoices"));
const RecipesPage = lazy(() => import("./pages/Recipes"));
const OrdersPage = lazy(() => import("./pages/Orders"));
const AssistantPage = lazy(() => import("./pages/Assistant"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SettingsPage = lazy(() => import("./pages/Settings"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <svg
        className="animate-spin h-8 w-8 app-accent"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('App crash', { error, componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 app-bg text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-[color:var(--app-danger)]/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--app-danger)]">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-xl font-bold app-text mb-2">
            Une erreur est survenue
          </h1>
          <p className="text-sm app-muted mb-6 max-w-sm">
            L'application a rencontre un probleme inattendu. Vos donnees sont intactes.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/dashboard';
            }}
            className="px-6 py-2.5 rounded-lg app-accent-bg font-medium text-sm transition-opacity active:opacity-70"
          >
            Revenir a l'accueil
          </button>
          {this.state.error && (
            <details className="mt-6 text-left w-full max-w-md">
              <summary className="text-xs app-muted cursor-pointer">Details techniques</summary>
              <pre className="mt-2 text-xs app-muted app-surface-2 app-border rounded p-3 overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const withSection = (section: string, node: ReactNode) => (
    <SectionErrorBoundary section={section}>{node}</SectionErrorBoundary>
  );

  return (
    <ErrorBoundary>
      <ToastContainer />
      <PinLockScreen>
        <Layout>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/temperature" element={withSection('Controles', <TemperaturePage />)} />
              <Route path="/traceability" element={withSection('Tracabilite', <TraceabilityPage />)} />
              <Route path="/tasks" element={withSection('Taches', <TasksPage />)} />
              <Route path="/recipes" element={withSection('Fiches techniques', <RecipesPage />)} />
              <Route path="/orders" element={withSection('Commandes', <OrdersPage />)} />
              <Route path="/invoices" element={withSection('Factures', <InvoicesPage />)} />
              <Route path="/assistant" element={withSection('Agent IA', <AssistantPage />)} />
              <Route path="/dashboard" element={withSection('Dashboard', <Dashboard />)} />
              <Route path="/settings" element={withSection('Parametres', <SettingsPage />)} />
            </Routes>
          </Suspense>
        </Layout>
      </PinLockScreen>
    </ErrorBoundary>
  );
}
