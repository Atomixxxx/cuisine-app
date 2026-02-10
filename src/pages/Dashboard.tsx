import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../stores/appStore';
import { showError, showSuccess } from '../stores/toastStore';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { buildSmartAlerts, type SmartAlertSeverity } from '../services/smartAlerts';
import type { ProductTrace, Task, TemperatureRecord } from '../types';
import { cn } from '../utils';

type KpiTone = 'success' | 'warning' | 'danger';

const alertStyles: Record<SmartAlertSeverity, { border: string; dot: string }> = {
  danger: { border: 'border-l-[color:var(--app-danger)]', dot: 'bg-[color:var(--app-danger)]' },
  warning: { border: 'border-l-[color:var(--app-warning)]', dot: 'bg-[color:var(--app-warning)]' },
  info: { border: 'border-l-[color:var(--app-info)]', dot: 'bg-[color:var(--app-info)]' },
};

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon apres-midi';
  return 'Bonsoir';
}

/* ── Mini KPI ── */
function KpiCard({ label, value, tone, icon, ringProgress }: {
  label: string; value: string; tone: KpiTone; icon: ReactNode; ringProgress?: number;
}) {
  const radius = 16, circ = 2 * Math.PI * radius;
  const progress = clamp(ringProgress ?? 0, 0, 1);
  const toneColor = tone === 'danger' ? 'var(--app-danger)' : tone === 'warning' ? 'var(--app-warning)' : 'var(--app-success)';

  return (
    <div className="dash-kpi" style={{ '--kpi-tone': toneColor } as React.CSSProperties}>
      <div className="flex items-center gap-2">
        <span className="dash-kpi-icon">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] app-muted leading-none truncate">{label}</p>
          <p className="text-[18px] font-bold app-text leading-none mt-0.5">{value}</p>
        </div>
        {typeof ringProgress === 'number' && (
          <div className="relative h-8 w-8 shrink-0">
            <svg className="-rotate-90" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r={radius} stroke="currentColor" strokeOpacity="0.15" strokeWidth="3.5" className="app-muted" />
              <circle cx="20" cy="20" r={radius} stroke={toneColor} strokeWidth="3.5" strokeLinecap="round"
                style={{ strokeDasharray: `${circ}`, strokeDashoffset: `${circ * (1 - progress)}` }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold app-text">{Math.round(progress * 100)}%</span>
          </div>
        )}
      </div>
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
  const { canShow: showInstall, install: installPwa, dismiss: dismissInstall } = usePwaInstall();

  const refreshAll = useCallback(() => {
    loadEquipment();
    const today = new Date();
    getTemperatureRecords(startOfDay(today), endOfDay(today)).then(setTodayRecords).catch(() => showError('Impossible de charger les temperatures'));
    getTasks(false).then(setTasks).catch(() => showError('Impossible de charger les taches'));
    getProducts().then(setProducts).catch(() => showError('Impossible de charger les produits'));
  }, [loadEquipment, getTemperatureRecords, getTasks, getProducts]);

  useEffect(() => { refreshAll(); }, [refreshAll]);
  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible') refreshAll(); };
    document.addEventListener('visibilitychange', h);
    window.addEventListener('focus', refreshAll);
    return () => { document.removeEventListener('visibilitychange', h); window.removeEventListener('focus', refreshAll); };
  }, [refreshAll]);

  const pendingTasks = tasks.filter((t) => !t.completed && !t.archived);
  const anomalies = todayRecords.filter((r) => !r.isCompliant).length;
  const checkedEquipment = new Set(todayRecords.map((r) => r.equipmentId)).size;
  const totalEquipment = equipment.length;
  const activeProducts = products.filter((p) => p.status !== 'used');
  const expiringProducts = activeProducts.filter((p) => {
    const d = Math.ceil((new Date(p.expirationDate).getTime() - Date.now()) / 864e5);
    return d <= 3;
  });
  const expiredCount = activeProducts.filter((p) => Math.ceil((new Date(p.expirationDate).getTime() - Date.now()) / 864e5) < 0).length;

  const smartAlerts = useMemo(
    () => buildSmartAlerts({ equipment, todayRecords, tasks, products: activeProducts }),
    [equipment, todayRecords, tasks, activeProducts],
  );

  const tempProgress = totalEquipment > 0 ? checkedEquipment / totalEquipment : 0;
  const tempTone: KpiTone = totalEquipment === 0 ? 'warning' : checkedEquipment === totalEquipment ? 'success' : 'warning';
  const anomTone: KpiTone = anomalies > 0 ? 'danger' : 'success';
  const taskTone: KpiTone = pendingTasks.length === 0 ? 'success' : pendingTasks.length >= 5 ? 'danger' : 'warning';
  const dlcTone: KpiTone = expiredCount > 0 ? 'danger' : expiringProducts.length > 0 ? 'warning' : 'success';

  const handleSos = () => {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 180]);
    showError('SOS hygiene active. Controle immediat des temperatures.');
    showSuccess('Etape 1/3: temperatures -> Etape 2/3: tracabilite -> Etape 3/3: taches critiques.');
    navigate('/temperature?quick=input');
  };

  return (
    <div className="dash-root">
      {/* Main content */}
      <div className="dash-main">
        {showInstall && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl dash-panel mb-1">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold app-text">Installer CuisineControl</p>
              <p className="text-[10px] app-muted">Acces rapide depuis l'ecran d'accueil</p>
            </div>
            <button onClick={installPwa} className="px-3 py-1 app-accent-bg rounded-full text-[10px] font-semibold active:opacity-70 shrink-0">Installer</button>
            <button onClick={dismissInstall} className="p-1 app-muted active:opacity-60" aria-label="Fermer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Row 1: Header + KPIs */}
        <div className="dash-panel dash-header-panel spx-scan-line animate-fade-in-up stagger-1">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="app-muted text-[10px] font-medium">{getGreeting()}</p>
              <h1 className="text-[20px] sm:text-[24px] font-bold app-text leading-none mt-0.5">{settings?.establishmentName || 'CuisineControl'}</h1>
            </div>
            <p className="app-muted text-[11px] shrink-0">{format(new Date(), 'dd/MM/yyyy', { locale: fr })}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KpiCard label="Temperatures" value={`${checkedEquipment}/${totalEquipment}`} tone={tempTone} ringProgress={tempProgress}
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M14 14.76V3.5a2 2 0 10-4 0v11.26a4 4 0 104 0z" /></svg>} />
            <KpiCard label="Anomalies" value={`${anomalies}`} tone={anomTone}
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 12l2.6 2.6L16 9.8" /></svg>} />
            <KpiCard label="Taches" value={`${pendingTasks.length}`} tone={taskTone}
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><rect x="7" y="5" width="11" height="15" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 3h7v4H9zM10 10h5M10 14h5" /></svg>} />
            <KpiCard label="DLC proches" value={`${expiringProducts.length}`} tone={dlcTone}
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" /></svg>} />
          </div>
        </div>

        {/* Row 2: multi-panel grid */}
        <div className="dash-grid animate-fade-in-up stagger-2">
          {/* Col A: SOS + Alerts */}
          <div className="dash-col-a">
            <button onClick={handleSos} className="sos-hygiene-btn sos-compact w-full">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/16 border border-white/25 text-white shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M4.93 19h14.14c1.43 0 2.33-1.55 1.62-2.8L13.62 4.2c-.71-1.25-2.53-1.25-3.24 0L3.31 16.2C2.6 17.45 3.5 19 4.93 19z" /></svg>
              </span>
              <span className="block text-left"><span className="block text-[14px] font-bold leading-none">SOS Hygiene</span></span>
            </button>

            <div className="dash-panel flex-1 mt-2">
              <h2 className="text-[12px] font-semibold mb-2 app-text flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--app-danger)]" />Alertes
              </h2>
              <AlertList alerts={smartAlerts.slice(0, 6)} onNavigate={navigate} />
            </div>
          </div>

          {/* Col B: Produits + Taches */}
          <div className="dash-col-b">
            {/* Produits proches */}
            <div className="dash-panel flex-1">
              <h2 className="text-[12px] font-semibold mb-2 app-text flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 app-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 2" /></svg>
                Produits a surveiller
              </h2>
              {expiringProducts.length === 0 ? (
                <p className="text-[11px] app-muted py-4 text-center">Aucun produit proche de la DLC</p>
              ) : (
                <div className="space-y-1">
                  {expiringProducts.slice(0, 5).map((p) => {
                    const daysLeft = Math.ceil((new Date(p.expirationDate).getTime() - Date.now()) / 864e5);
                    const expired = daysLeft < 0;
                    return (
                      <button key={p.id} onClick={() => navigate('/traceability')}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg app-surface-2 border border-[color:var(--app-border)] text-left transition-opacity active:opacity-70">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', expired ? 'bg-[color:var(--app-danger)]' : 'bg-[color:var(--app-warning)]')} />
                        <span className="text-[11px] font-medium app-text truncate flex-1">{p.productName}</span>
                        <span className={cn('text-[10px] font-semibold shrink-0', expired ? 'text-[color:var(--app-danger)]' : 'text-[color:var(--app-warning)]')}>
                          {expired ? 'Expire' : `J-${daysLeft}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Taches en attente */}
            <div className="dash-panel flex-1">
              <h2 className="text-[12px] font-semibold mb-2 app-text flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 app-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="7" y="5" width="11" height="15" rx="2" /><path strokeLinecap="round" d="M9 3h7v4H9zM10 10h5M10 14h5" /></svg>
                Taches en attente
              </h2>
              {pendingTasks.length === 0 ? (
                <div className="py-4 text-center">
                  <span className="inline-flex h-8 w-8 rounded-full bg-[color:var(--app-success)]/15 text-[color:var(--app-success)] items-center justify-center mb-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <p className="text-[11px] app-muted">Tout est fait</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {pendingTasks.slice(0, 5).map((t) => (
                    <button key={t.id} onClick={() => navigate('/tasks')}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg app-surface-2 border border-[color:var(--app-border)] text-left transition-opacity active:opacity-70">
                      <span className="w-3 h-3 rounded border border-[color:var(--app-muted)] shrink-0" />
                      <span className="text-[11px] font-medium app-text truncate flex-1">{t.title}</span>
                      {t.priority === 'high' && <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--app-danger)] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Alert list (table-like rows) ── */
function AlertList({ alerts, onNavigate }: { alerts: ReturnType<typeof buildSmartAlerts>; onNavigate: (p: string) => void }) {
  if (alerts.length === 0) return <p className="text-[11px] app-muted py-3 text-center">Aucune alerte</p>;
  const allClear = alerts[0]?.id === 'all-clear';
  if (allClear) return (
    <div className="py-4 text-center flex flex-col items-center gap-1">
      <span className="h-10 w-10 rounded-full bg-[color:var(--app-success)]/15 text-[color:var(--app-success)] inline-flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>
      </span>
      <p className="text-[12px] font-semibold app-text">Tout est OK</p>
      <p className="text-[10px] app-muted">{alerts[0].description}</p>
    </div>
  );

  return (
    <div className="space-y-0.5">
      {alerts.map((a) => (
        <button key={a.id} onClick={() => onNavigate(a.path)}
          className={cn('w-full flex items-center gap-2 px-2 py-2 rounded-lg border-l-[3px] transition-opacity active:opacity-70 text-left', alertStyles[a.severity].border, 'app-surface-2')}>
          <span className={cn('w-2 h-2 rounded-full shrink-0', alertStyles[a.severity].dot)} />
          <span className="text-[11px] font-medium app-text truncate flex-1">{a.title}</span>
          <span className="text-[10px] app-muted shrink-0">{a.description.split('.')[0]}</span>
        </button>
      ))}
    </div>
  );
}
