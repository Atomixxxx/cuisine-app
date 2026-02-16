import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBadgeStore } from "../../stores/badgeStore";
import { useAppStore } from "../../stores/appStore";
import { STORAGE_KEYS } from "../../constants/storageKeys";

/* ---------- Tab bar config with colored icons (matching sidebar) ---------- */

interface TabDef {
  path: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}

const tabs: TabDef[] = [
  {
    path: "/dashboard",
    label: "Accueil",
    color: "var(--tab-home)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    path: "/temperature",
    label: "Controles",
    color: "var(--tab-controls)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    ),
  },
  {
    path: "/traceability",
    label: "Tracabilite",
    color: "var(--tab-traceability)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
      </svg>
    ),
  },
  {
    path: "/tasks",
    label: "Taches",
    color: "var(--tab-tasks)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    ),
  },
  {
    path: "/recipes",
    label: "Fiches",
    color: "var(--tab-recipes)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7V4z" />
        <path d="M7 4H6a2 2 0 00-2 2v12a2 2 0 002 2h1M10 9h6M10 13h6" />
      </svg>
    ),
  },
  {
    path: "/orders",
    label: "Commandes",
    color: "var(--tab-orders)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 6h15l-1.5 8.5H8.2L6 6z" />
        <path d="M6 6L5 3H2" />
        <circle cx="9" cy="19" r="1.5" />
        <circle cx="18" cy="19" r="1.5" />
      </svg>
    ),
  },
  {
    path: "/invoices",
    label: "Factures",
    color: "var(--tab-invoices)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    path: "/assistant",
    label: "Agent IA",
    color: "var(--tab-assistant)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="11" rx="3" />
        <path d="M12 15v3M9 20h6M9 9h.01M15 9h.01" />
      </svg>
    ),
  },
];

/* ---------- Layout ---------- */
const LAST_BACKUP_KEY = STORAGE_KEYS.backupLastAt;

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

function formatBackupStatus(lastBackupAt: string | null): string {
  if (!lastBackupAt) return 'Backup: jamais';
  const ts = new Date(lastBackupAt).getTime();
  if (Number.isNaN(ts)) return 'Backup: inconnu';
  const deltaMin = Math.floor((Date.now() - ts) / (1000 * 60));
  if (deltaMin < 1) return 'Backup: a l instant';
  if (deltaMin < 60) return `Backup: il y a ${deltaMin} min`;
  const deltaHours = Math.floor(deltaMin / 60);
  if (deltaHours < 24) return `Backup: il y a ${deltaHours} h`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `Backup: il y a ${deltaDays} j`;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboardRoute = location.pathname === '/dashboard';
  const online = useOnlineStatus();
  const expiringCount = useBadgeStore(s => s.expiringCount);
  const darkMode = useAppStore((s) => s.darkMode);
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => localStorage.getItem(LAST_BACKUP_KEY));

  useEffect(() => {
    void loadSettings();
    localStorage.removeItem(STORAGE_KEYS.theme);
  }, [loadSettings]);

  useEffect(() => {
    const refresh = () => setLastBackupAt(localStorage.getItem(LAST_BACKUP_KEY));
    window.addEventListener('storage', refresh);
    window.addEventListener('cuisine-backup-updated', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('cuisine-backup-updated', refresh as EventListener);
    };
  }, []);

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen app-glass-bg app-text flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 px-3 py-2 rounded-lg app-accent-bg"
      >
        Aller au contenu principal
      </a>
      {/* Offline banner */}
      {!online && (
        <div className="app-warning-bg text-white text-xs font-medium text-center py-1.5 px-4">
          Hors ligne - les fonctions IA sont indisponibles
        </div>
      )}

      {!isDashboardRoute && (
        <header className="sticky top-0 z-40 glass-header px-3 py-1.5 sm:px-4 sm:py-2 flex items-center justify-between">
          <h1 className="text-[13px] sm:text-[14px] font-semibold tracking-tight app-text truncate">
            CuisineControl
          </h1>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full app-surface-2">
              {online ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-[color:var(--app-success)]"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-[color:var(--app-warning)]"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              )}
              <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-[color:var(--app-success)]' : 'bg-[color:var(--app-warning)]'}`} />
              <span className="ios-small app-muted">{online ? 'En ligne' : 'Hors ligne'}</span>
            </div>
            <div className="hidden md:block ios-small app-muted">
              {formatBackupStatus(lastBackupAt)}
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center app-muted active:opacity-60 transition-opacity"
              aria-label="Parametres"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center app-muted active:opacity-60 transition-opacity"
              aria-label="Basculer le mode sombre"
            >
              {darkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>
      )}

      {/* Page content */}
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto pb-14">
        {children}
      </main>

      {/* Bottom tab bar — SpaceX style */}
      <nav aria-label="Navigation principale" className="fixed bottom-0 inset-x-0 z-40 glass-header hairline-t pb-safe">
        <div className="flex items-stretch justify-around" role="tablist">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <button
                key={tab.path}
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center justify-center flex-1 min-h-[42px] sm:min-h-[46px] px-0.5 transition-all duration-300 active:opacity-60"
                style={{ color: active ? tab.color : undefined }}
              >
                <span
                  className={`relative transition-all duration-300 ${active ? 'spx-icon-glow' : 'app-muted'}`}
                  style={active ? { color: tab.color } : undefined}
                >
                  {tab.icon}
                  {tab.path === "/traceability" && expiringCount > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-[color:var(--app-danger)] text-white text-[9px] leading-[14px] text-center font-semibold"
                      aria-label={`${expiringCount} produits a verifier`}
                      title={`${expiringCount} produits a verifier`}
                    >
                      {expiringCount > 9 ? '9+' : expiringCount}
                    </span>
                  )}
                </span>
                <span
                  className="text-[7px] sm:text-[8px] font-medium leading-tight uppercase tracking-[0.06em] transition-colors duration-300"
                  style={active ? { color: tab.color } : undefined}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
