import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../stores/appStore';
import { showError, showSuccess } from '../stores/toastStore';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { buildSmartAlerts } from '../services/smartAlerts';
import type { ProductTrace, Task, TemperatureRecord } from '../types';

const alertStyles = {
  danger: {
    box: 'border-[color:var(--app-danger)]/30 bg-[color:var(--app-danger)]/10',
    badge: 'text-[color:var(--app-danger)] bg-[color:var(--app-danger)]/15',
  },
  warning: {
    box: 'border-[color:var(--app-warning)]/30 bg-[color:var(--app-warning)]/10',
    badge: 'text-[color:var(--app-warning)] bg-[color:var(--app-warning)]/15',
  },
  info: {
    box: 'border-[color:var(--app-info)]/30 bg-[color:var(--app-info)]/10',
    badge: 'text-[color:var(--app-info)] bg-[color:var(--app-info)]/15',
  },
} as const;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon apres-midi';
  return 'Bonsoir';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const equipment = useAppStore((s) => s.equipment);
  const loadEquipment = useAppStore((s) => s.loadEquipment);
  const getTemperatureRecords = useAppStore((s) => s.getTemperatureRecords);
  const getTasks = useAppStore((s) => s.getTasks);
  const getProducts = useAppStore((s) => s.getProducts);
  const settings = useAppStore((s) => s.settings);

  const [todayRecords, setTodayRecords] = useState<TemperatureRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<ProductTrace[]>([]);
  const { canShow: showInstall, install: installPwa, dismiss: dismissInstall } = usePwaInstall();

  const refreshAll = useCallback(() => {
    loadEquipment();
    const today = new Date();
    getTemperatureRecords(startOfDay(today), endOfDay(today))
      .then(setTodayRecords)
      .catch(() => showError('Impossible de charger les temperatures'));
    getTasks(false).then(setTasks).catch(() => showError('Impossible de charger les taches'));
    getProducts().then(setProducts).catch(() => showError('Impossible de charger les produits'));
  }, [loadEquipment, getTemperatureRecords, getTasks, getProducts]);

  // Load on mount
  useEffect(() => { refreshAll(); }, [refreshAll]);

  // Refresh when user comes back to the tab or the app regains focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refreshAll);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refreshAll);
    };
  }, [refreshAll]);

  const pendingTasks = tasks.filter((t) => !t.completed && !t.archived).length;
  const anomalies = todayRecords.filter((r) => !r.isCompliant).length;
  const checkedEquipment = new Set(todayRecords.map((r) => r.equipmentId)).size;

  const expiringProducts = products.filter((product) => {
    const daysLeft = Math.ceil((new Date(product.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 3;
  });

  const smartAlerts = useMemo(
    () => buildSmartAlerts({ equipment, todayRecords, tasks, products }),
    [equipment, todayRecords, tasks, products],
  );

  const handleSosHygiene = () => {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 180]);
    showError('SOS hygiene active. Controle immediat des temperatures.');
    showSuccess('Etape 1/3: temperatures -> Etape 2/3: tracabilite -> Etape 3/3: taches critiques.');
    navigate('/temperature?quick=input');
  };

  return (
    <div className="app-page-wrap pb-28 lg:pl-20">
      {showInstall && (
        <div className="flex items-center gap-3 p-4 rounded-2xl app-panel">
          <div className="flex-1">
            <p className="ios-body font-semibold app-text">Installer CuisineControl</p>
            <p className="ios-caption app-muted mt-0.5">Acces rapide depuis l'ecran d'accueil</p>
          </div>
          <button
            onClick={installPwa}
            className="px-4 py-2 app-accent-bg rounded-full ios-caption font-semibold active:opacity-70 shrink-0"
          >
            Installer
          </button>
          <button onClick={dismissInstall} className="p-2 app-muted active:opacity-60" aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <section className="app-hero-card space-y-4">
        <div>
          <p className="app-muted ios-caption font-medium">{getGreeting()}</p>
          <h1 className="ios-title mt-1">{settings?.establishmentName || 'CuisineControl'}</h1>
          <p className="app-muted ios-body mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
        </div>
        <div className="app-kpi-grid">
          <div className="app-kpi-card">
            <p className="app-kpi-label">Temperatures</p>
            <p className="app-kpi-value">{checkedEquipment}/{equipment.length}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Anomalies</p>
            <p className="app-kpi-value">{anomalies}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Taches en attente</p>
            <p className="app-kpi-value">{pendingTasks}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">DLC proches</p>
            <p className="app-kpi-value">{expiringProducts.length}</p>
          </div>
        </div>
        <button
          onClick={handleSosHygiene}
          className="w-full rounded-2xl p-4 sm:p-5 text-left app-danger-bg text-white active:opacity-80 transition-opacity shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
        >
          <p className="text-[18px] sm:text-[20px] font-bold leading-tight">SOS Hygiene</p>
          <p className="text-[12px] sm:[font-size:13px] text-white/90 mt-1">Lancer le protocole rapide en 1 geste</p>
        </button>
      </section>

      <QuickActions onNavigate={navigate} />
      <AlertPanel alerts={smartAlerts.slice(0, 3)} onNavigate={navigate} />

      <button
        onClick={() => navigate('/assistant')}
        className="fixed bottom-20 right-3 sm:bottom-24 sm:right-5 z-30 h-12 w-12 sm:h-14 sm:w-14 rounded-full active:opacity-85 transition-opacity flex items-center justify-center"
        aria-label="Ouvrir l'assistant IA"
        title="Assistant IA"
      >
        <span className="absolute inset-0 rounded-full bg-sky-400/45 blur-md" aria-hidden />
        <span
          className="absolute inset-[2px] rounded-full shadow-[inset_0_1px_4px_rgba(255,255,255,0.45),0_14px_30px_rgba(15,23,42,0.34)]"
          style={{ background: 'radial-gradient(circle at 30% 26%, #e0f2fe 0%, #7dd3fc 22%, #38bdf8 48%, #0284c7 72%, #0f172a 100%)' }}
          aria-hidden
        />
        <svg
          className="relative z-10 text-white drop-shadow-[0_2px_4px_rgba(15,23,42,0.55)]"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="11" rx="3" />
          <path d="M12 15v3" />
          <path d="M9 20h6" />
          <path d="M9 9h.01M15 9h.01" />
        </svg>
      </button>
    </div>
  );
}

function AlertPanel({
  alerts,
  onNavigate,
}: {
  alerts: ReturnType<typeof buildSmartAlerts>;
  onNavigate: (path: string) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="app-panel">
      <h2 className="text-[16px] sm:text-[18px] font-semibold mb-2 sm:mb-3 app-text">Alertes prioritaires</h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            onClick={() => onNavigate(alert.path)}
            className={`w-full text-left rounded-2xl border p-3 transition-opacity active:opacity-70 ${alertStyles[alert.severity].box}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="ios-caption sm:text-[14px] font-semibold app-text">{alert.title}</p>
                <p className="text-[12px] sm:[font-size:13px] app-muted mt-0.5">{alert.description}</p>
              </div>
              <span className={`ios-small font-semibold px-2 py-1 rounded-full ${alertStyles[alert.severity].badge}`}>
                {alert.severity.toUpperCase()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickActions({ onNavigate }: { onNavigate: (path: string) => void }) {
  const actions = [
    {
      label: 'Saisir temperatures',
      path: '/temperature',
      color: 'text-[color:var(--app-accent)]',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 14.76V3.5a2 2 0 10-4 0v11.26a4 4 0 104 0z" />
        </svg>
      ),
    },
    {
      label: 'Scanner produit',
      path: '/traceability?tab=scanner',
      color: 'text-[color:var(--app-info)]',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
        </svg>
      ),
    },
    {
      label: 'Nouvelle tache',
      path: '/tasks?quick=new',
      color: 'text-[color:var(--app-success)]',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      ),
    },
    {
      label: 'Scanner facture',
      path: '/invoices?quick=scan',
      color: 'text-[color:var(--app-warning)]',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      ),
    },
    {
      label: 'Fiche technique',
      path: '/recipes',
      color: 'text-[color:var(--app-accent)]',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7V4z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4H6a2 2 0 00-2 2v12a2 2 0 002 2h1M10 9h6M10 13h6" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <div className="app-panel lg:hidden">
        <h2 className="text-[14px] sm:text-[16px] font-semibold mb-2 app-text">Actions rapides</h2>
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => onNavigate(action.path)}
              className="shrink-0 min-w-[80px] sm:min-w-[92px] rounded-xl app-surface-2 border border-[color:var(--app-border)] px-2 py-2 sm:px-2.5 sm:py-2.5 active:opacity-80 transition-opacity"
              title={action.label}
              aria-label={action.label}
            >
              <div className="flex flex-col items-center gap-1">
                <span className={action.color}>{action.icon}</span>
                <span className="text-[10px] sm:[font-size:11px] font-semibold app-text text-center leading-tight">{action.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div
        className="hidden lg:flex fixed left-2 top-24 z-30 flex-col gap-2 rounded-2xl border border-[color:var(--app-border)] p-2 app-surface-2 shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
        aria-label="Actions rapides"
      >
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => onNavigate(action.path)}
            className="h-11 w-11 rounded-xl app-bg border border-[color:var(--app-border)] active:opacity-80 transition-opacity flex items-center justify-center"
            title={action.label}
            aria-label={action.label}
          >
            <span className={action.color}>{action.icon}</span>
          </button>
        ))}
        <div className="px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] app-muted text-center">Actions</p>
        </div>
      </div>
    </>
  );
}

