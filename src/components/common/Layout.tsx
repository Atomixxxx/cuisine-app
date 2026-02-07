import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBadgeStore } from "../../stores/badgeStore";
import { useAppStore } from "../../stores/appStore";
import { STORAGE_KEYS } from "../../constants/storageKeys";

/* ---------- Tab bar icons ---------- */

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ThermometerIcon({ active: _active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function PackageIcon({ active: _active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ChecklistIcon({ active: _active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function ReceiptIcon({ active: _active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </svg>
  );
}

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

/* ---------- Tab config ---------- */

interface TabDef {
  path: string;
  label: string;
  icon: (props: { active: boolean }) => React.JSX.Element;
}

const tabs: TabDef[] = [
  { path: "/dashboard", label: "Accueil", icon: HomeIcon },
  { path: "/temperature", label: "Controles", icon: ThermometerIcon },
  { path: "/traceability", label: "Tracabilite", icon: PackageIcon },
  { path: "/tasks", label: "Taches", icon: ChecklistIcon },
  { path: "/recipes", label: "Fiches", icon: BookIcon },
  { path: "/invoices", label: "Factures", icon: ReceiptIcon },
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
    <div className="min-h-screen app-bg app-text flex flex-col">
      {/* Offline banner */}
      {!online && (
        <div className="app-warning-bg text-white text-xs font-medium text-center py-1.5 px-4">
          Hors ligne - les fonctions IA sont indisponibles
        </div>
      )}

      {/* Header — minimal like apple.com nav */}
      <header className="sticky top-0 z-40 app-header px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between hairline-b">
        <h1 className="text-[15px] sm:text-[17px] font-semibold tracking-tight app-text truncate">
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
            <span className="text-[11px] app-muted">{online ? 'En ligne' : 'Hors ligne'}</span>
          </div>
          <div className="hidden md:block text-[11px] app-muted">
            {formatBackupStatus(lastBackupAt)}
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] inline-flex items-center justify-center app-muted active:opacity-60 transition-opacity"
            aria-label="Parametres"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] inline-flex items-center justify-center app-muted active:opacity-60 transition-opacity"
            aria-label="Basculer le mode sombre"
          >
            {darkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      {/* Bottom tab bar */}
      <nav aria-label="Navigation principale" className="fixed bottom-0 inset-x-0 z-40 app-nav hairline-t pb-safe">
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
                className={[
                  "flex flex-col items-center justify-center gap-0 flex-1 min-h-[46px] sm:min-h-[50px] px-0.5 transition-colors active:opacity-60",
                  active ? "text-[color:var(--app-accent)]" : "app-muted",
                ].join(" ")}
              >
                <span className="relative">
                  <tab.icon active={active} />
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
                <span className="text-[9px] sm:text-[10px] font-medium leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
