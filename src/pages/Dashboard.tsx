import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../stores/appStore';
import { showError } from '../stores/toastStore';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { buildSmartAlerts, type SmartAlertSeverity } from '../services/smartAlerts';
import type { ProductTrace, Task, TemperatureRecord } from '../types';
import { cn } from '../utils';

type KpiTone = 'success' | 'warning' | 'danger';
type DashboardView = 'overview' | 'notifications';

const kpiToneClass: Record<KpiTone, string> = {
  success: 'dash-kpi-tone-success',
  warning: 'dash-kpi-tone-warning',
  danger: 'dash-kpi-tone-danger',
};

const alertStyles: Record<SmartAlertSeverity, { card: string; dot: string }> = {
  danger: { card: 'alert-card-danger', dot: 'bg-[color:var(--app-danger)]' },
  warning: { card: 'alert-card-warning', dot: 'bg-[color:var(--app-warning)]' },
  info: { card: 'alert-card-info', dot: 'bg-[color:var(--app-info)]' },
};

const ThermometerIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 14.76V3.5a2 2 0 10-4 0v11.26a4 4 0 104 0z" />
  </svg>
);

const CheckCircleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12l2.6 2.6L16 9.8" />
  </svg>
);

const ClipboardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <rect x="7" y="5" width="11" height="15" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h7v4H9zM10 10h5M10 14h5" />
  </svg>
);

const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
  </svg>
);

const BellIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17H9a2 2 0 01-2-2v-3a5 5 0 0110 0v3a2 2 0 01-2 2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19a2 2 0 004 0" />
  </svg>
);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon apres-midi';
  return 'Bonsoir';
}

function KpiCardGlass({
  label,
  value,
  tone,
  icon,
  route,
  onNavigate,
  subValue,
  isActive = false,
}: {
  label: string;
  value: string;
  tone: KpiTone;
  icon: ReactNode;
  route: string;
  onNavigate: (path: string) => void;
  subValue?: string;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(route)}
      className={cn('dash-kpi-glass glass-card', kpiToneClass[tone], isActive && 'active')}
    >
      <span className="dash-kpi-icon-glass">{icon}</span>
      <span className="dash-kpi-label">{label}</span>
      <span className="dash-kpi-value">{value}</span>
      {subValue && <span className="dash-kpi-subvalue">{subValue}</span>}
    </button>
  );
}

function PillToggle({
  view,
  onChange,
  notificationCount,
}: {
  view: DashboardView;
  onChange: (next: DashboardView) => void;
  notificationCount: number;
}) {
  return (
    <div className="pill-toggle glass-card" aria-label="Vue dashboard">
      <button
        type="button"
        aria-pressed={view === 'overview'}
        onClick={() => onChange('overview')}
        className={cn('pill-toggle-btn', view === 'overview' && 'active')}
      >
        Vue
      </button>
      <button
        type="button"
        aria-pressed={view === 'notifications'}
        onClick={() => onChange('notifications')}
        className={cn('pill-toggle-btn', view === 'notifications' && 'active')}
      >
        Notifs
        {notificationCount > 0 && (
          <span className="pill-badge">{notificationCount > 9 ? '9+' : notificationCount}</span>
        )}
      </button>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="dash-section-card glass-card">
      <div className="dash-section-head">
        <span className="dash-section-icon">{icon}</span>
        <h2 className="dash-section-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyTaskState() {
  return (
    <div className="dash-empty-state">
      <span className="dash-empty-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <p className="dash-empty-title">Tout est fait</p>
      <p className="dash-empty-copy">Aucune tache en attente.</p>
    </div>
  );
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
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const { canShow: showInstall, install: installPwa, dismiss: dismissInstall } = usePwaInstall();
  const refreshTimerRef = useRef<number | null>(null);

  const refreshAll = useCallback(() => {
    loadEquipment();
    const now = new Date();
    getTemperatureRecords(startOfDay(now), endOfDay(now))
      .then(setTodayRecords)
      .catch(() => showError('Impossible de charger les temperatures'))
      .finally(() => setCurrentTimestamp(now.getTime()));
    getTasks(false).then(setTasks).catch(() => showError('Impossible de charger les taches'));
    getProducts().then(setProducts).catch(() => showError('Impossible de charger les produits'));
  }, [loadEquipment, getTemperatureRecords, getTasks, getProducts]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      refreshAll();
    }, 180);
  }, [refreshAll]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', h);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      document.removeEventListener('visibilitychange', h);
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [scheduleRefresh]);

  const pendingTasks = tasks.filter((t) => !t.completed && !t.archived);
  const anomalies = todayRecords.filter((r) => !r.isCompliant).length;
  const checkedEquipment = new Set(todayRecords.map((r) => r.equipmentId)).size;
  const totalEquipment = equipment.length;
  const activeProducts = products.filter((p) => p.status !== 'used');
  const getDaysLeft = useCallback(
    (expirationDate: Date | string) => Math.ceil((new Date(expirationDate).getTime() - currentTimestamp) / 864e5),
    [currentTimestamp],
  );
  const expiringProducts = activeProducts.filter((p) => getDaysLeft(p.expirationDate) <= 3);
  const expiredCount = activeProducts.filter((p) => getDaysLeft(p.expirationDate) < 0).length;

  const smartAlerts = buildSmartAlerts({ equipment, todayRecords, tasks, products: activeProducts });
  const actionableAlerts = smartAlerts.filter((alert) => alert.id !== 'all-clear');
  const notificationCount = actionableAlerts.length;

  const tempProgress = totalEquipment > 0 ? checkedEquipment / totalEquipment : 0;
  const tempTone: KpiTone = totalEquipment === 0 ? 'warning' : checkedEquipment === totalEquipment ? 'success' : 'warning';
  const anomTone: KpiTone = anomalies > 0 ? 'danger' : 'success';
  const taskTone: KpiTone = pendingTasks.length === 0 ? 'success' : pendingTasks.length >= 5 ? 'danger' : 'warning';
  const dlcTone: KpiTone = expiredCount > 0 ? 'danger' : expiringProducts.length > 0 ? 'warning' : 'success';

  return (
    <div className="dash-root">
      <div className="dash-main">
        {showInstall && (
          <div className="glass-card dash-install-card">
            <div className="min-w-0 flex-1">
              <p className="dash-install-title">Installer CuisineControl</p>
              <p className="dash-install-copy">Acces rapide depuis l ecran d accueil</p>
            </div>
            <button onClick={installPwa} className="dash-install-btn" type="button">
              Installer
            </button>
            <button onClick={dismissInstall} className="dash-close-btn" type="button" aria-label="Fermer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <section className="glass-card dash-hero animate-fade-in-up stagger-1">
          <div className="dash-hero-head">
            <div className="min-w-0">
              <p className="dash-greeting">{getGreeting()},</p>
              <h1 className="dash-establishment">{settings?.establishmentName || 'CuisineControl'}</h1>
            </div>
            <p className="dash-date">{format(new Date(), 'dd/MM/yyyy', { locale: fr })}</p>
          </div>

          <div className="dash-kpi-row">
            <KpiCardGlass
              label="Temperatures"
              value={`${checkedEquipment}/${totalEquipment}`}
              subValue={`${Math.round(tempProgress * 100)}% couvert`}
              tone={tempTone}
              icon={ThermometerIcon}
              route="/temperature"
              onNavigate={navigate}
              isActive
            />
            <KpiCardGlass
              label="Anomalies"
              value={`${anomalies}`}
              tone={anomTone}
              icon={CheckCircleIcon}
              route="/temperature"
              onNavigate={navigate}
            />
            <KpiCardGlass
              label="Taches"
              value={`${pendingTasks.length}`}
              tone={taskTone}
              icon={ClipboardIcon}
              route="/tasks"
              onNavigate={navigate}
            />
            <KpiCardGlass
              label="DLC proches"
              value={`${expiringProducts.length}`}
              tone={dlcTone}
              icon={ClockIcon}
              route="/traceability"
              onNavigate={navigate}
            />
          </div>
        </section>

        <div className="dash-toggle-wrap animate-fade-in-up stagger-2">
          <PillToggle view={dashboardView} onChange={setDashboardView} notificationCount={notificationCount} />
        </div>

        {dashboardView === 'overview' ? (
          <div className="dash-overview-grid animate-fade-in-up stagger-2">
            <SectionCard title="Notifications" icon={BellIcon}>
              <AlertList alerts={smartAlerts.slice(0, 6)} onNavigate={navigate} />
            </SectionCard>

            <SectionCard title="Produits a surveiller" icon={ClockIcon}>
              {expiringProducts.length === 0 ? (
                <p className="dash-empty-inline">Aucun produit proche de la DLC</p>
              ) : (
                <div className="dash-item-list">
                  {expiringProducts.slice(0, 5).map((product) => {
                    const daysLeft = getDaysLeft(product.expirationDate);
                    const expired = daysLeft < 0;
                    return (
                      <button
                        key={product.id}
                        onClick={() => navigate('/traceability')}
                        type="button"
                        className="dash-list-row"
                      >
                        <span
                          className={cn(
                            'dash-list-dot',
                            expired ? 'bg-[color:var(--app-danger)]' : 'bg-[color:var(--app-warning)]',
                          )}
                        />
                        <span className="dash-list-title">{product.productName}</span>
                        <span
                          className={cn(
                            'dash-list-meta',
                            expired ? 'text-[color:var(--app-danger)]' : 'text-[color:var(--app-warning)]',
                          )}
                        >
                          {expired ? 'Expire' : `J-${daysLeft}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Taches en attente" icon={ClipboardIcon}>
              {pendingTasks.length === 0 ? (
                <EmptyTaskState />
              ) : (
                <div className="dash-item-list">
                  {pendingTasks.slice(0, 5).map((task) => (
                    <button key={task.id} onClick={() => navigate('/tasks')} type="button" className="dash-list-row">
                      <span className="dash-checkbox" />
                      <span className="dash-list-title">{task.title}</span>
                      {task.priority === 'high' && <span className="dash-list-dot bg-[color:var(--app-danger)]" />}
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        ) : (
          <div className="animate-fade-in-up stagger-2">
            <SectionCard title="Notifications" icon={BellIcon}>
              <AlertList
                alerts={smartAlerts.slice(0, 12)}
                onNavigate={(path) => {
                  navigate(path);
                  setDashboardView('overview');
                }}
              />
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertList({ alerts, onNavigate }: { alerts: ReturnType<typeof buildSmartAlerts>; onNavigate: (path: string) => void }) {
  if (alerts.length === 0) {
    return <p className="dash-empty-inline">Aucune alerte</p>;
  }

  if (alerts[0]?.id === 'all-clear') {
    return (
      <div className="dash-empty-state">
        <span className="dash-empty-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <p className="dash-empty-title">Tout est OK</p>
        <p className="dash-empty-copy">{alerts[0].description}</p>
      </div>
    );
  }

  return (
    <div className="dash-item-list">
      {alerts.map((alert) => (
        <button
          key={alert.id}
          onClick={() => onNavigate(alert.path)}
          type="button"
          className={cn('alert-card dash-alert-row', alertStyles[alert.severity].card)}
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', alertStyles[alert.severity].dot)} />
          <span className="dash-list-title">{alert.title}</span>
          <span className="dash-list-meta">{alert.description.split('.')[0]}</span>
        </button>
      ))}
    </div>
  );
}
