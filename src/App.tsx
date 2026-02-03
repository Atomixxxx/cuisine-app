import React, { Component, Suspense, lazy } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/common/Layout";
import ToastContainer from "./components/common/ToastContainer";

/* Lazy-loaded page components */
const TemperaturePage = lazy(() => import("./pages/TemperaturePage"));
const TraceabilityPage = lazy(() => import("./pages/TraceabilityPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SettingsPage = lazy(() => import("./pages/Settings"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <svg
        className="animate-spin h-8 w-8 text-primary dark:text-primary-light"
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
    console.error('App crash:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#f5f5f7] dark:bg-[#1d1d1f] text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#ff3b30]">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
            Une erreur est survenue
          </h1>
          <p className="text-sm text-[#86868b] dark:text-[#86868b] mb-6 max-w-sm">
            L'application a rencontre un probleme inattendu. Vos donnees sont intactes.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/dashboard';
            }}
            className="px-6 py-2.5 bg-[#2997FF] hover:bg-[#2997FF] text-white rounded-lg font-medium text-sm transition-colors"
          >
            Revenir a l'accueil
          </button>
          {this.state.error && (
            <details className="mt-6 text-left w-full max-w-md">
              <summary className="text-xs text-[#86868b] cursor-pointer">Details techniques</summary>
              <pre className="mt-2 text-xs text-[#86868b] bg-[#e8e8ed] dark:bg-[#1d1d1f] rounded p-3 overflow-auto max-h-40">
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
  return (
    <ErrorBoundary>
      <ToastContainer />
      <Layout>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/temperature" element={<TemperaturePage />} />
            <Route path="/traceability" element={<TraceabilityPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </Layout>
    </ErrorBoundary>
  );
}
