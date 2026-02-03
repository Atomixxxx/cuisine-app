import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { showError } from '../stores/toastStore';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { format, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { TemperatureRecord, Task, ProductTrace, Invoice } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const equipment = useAppStore(s => s.equipment);
  const loadEquipment = useAppStore(s => s.loadEquipment);
  const getTemperatureRecords = useAppStore(s => s.getTemperatureRecords);
  const getTasks = useAppStore(s => s.getTasks);
  const getProducts = useAppStore(s => s.getProducts);
  const getInvoices = useAppStore(s => s.getInvoices);
  const settings = useAppStore(s => s.settings);
  const [todayRecords, setTodayRecords] = useState<TemperatureRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<ProductTrace[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const { canShow: showInstall, install: installPwa, dismiss: dismissInstall } = usePwaInstall();

  useEffect(() => {
    loadEquipment();
    const today = new Date();
    getTemperatureRecords(startOfDay(today), endOfDay(today)).then(setTodayRecords).catch(() => showError('Impossible de charger les temperatures'));
    getTasks(false).then(setTasks).catch(() => showError('Impossible de charger les taches'));
    getProducts().then(p => setProducts(p.slice(0, 5))).catch(() => showError('Impossible de charger les produits'));
    getInvoices().then(i => setInvoices(i.slice(0, 5))).catch(() => showError('Impossible de charger les factures'));
  }, []);

  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const anomalies = todayRecords.filter(r => !r.isCompliant).length;
  const equipChecked = new Set(todayRecords.map(r => r.equipmentId)).size;

  const expiringProducts = products.filter(p => {
    const daysLeft = Math.ceil((new Date(p.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 3 && daysLeft >= 0;
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  return (
    <div className="px-5 py-6 space-y-8 max-w-2xl mx-auto">
      {/* PWA install */}
      {showInstall && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#1d1d1f] ios-card-shadow">
          <div className="flex-1">
            <p className="text-[15px] font-semibold">Installer CuisineControl</p>
            <p className="text-[13px] text-[#86868b] mt-0.5">Accès rapide depuis l'écran d'accueil</p>
          </div>
          <button onClick={installPwa} className="px-4 py-2 bg-[#2997FF] text-white rounded-full text-[13px] font-semibold active:opacity-70 shrink-0">
            Installer
          </button>
          <button onClick={dismissInstall} className="p-2 text-[#86868b] active:opacity-60" aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Hero */}
      <div>
        <p className="text-[#86868b] text-[14px]">{greeting()}.</p>
        <h1 className="ios-title mt-1">
          {settings?.establishmentName || 'CuisineControl'}
        </h1>
        <p className="text-[#86868b] text-[17px] mt-2">
          {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
        </p>
      </div>

      {/* Overview section */}
      <div>
        <h2 className="text-[21px] font-semibold mb-4">
          <span className="text-[#2997FF]">Aujourd'hui.</span>{' '}
          <span className="text-[#86868b]">Votre activité en un coup d'œil.</span>
        </h2>

        <div className="grid grid-cols-2 gap-4">
          {/* Temperature card */}
          <button
            onClick={() => navigate('/temperature')}
            className="rounded-2xl bg-white dark:bg-[#1d1d1f] p-5 text-left active:opacity-80 transition-opacity ios-card-shadow"
          >
            <p className="text-[#86868b] text-[12px] font-semibold uppercase tracking-wide">Températures</p>
            <p className="text-[36px] font-bold tracking-tight leading-none mt-2">
              {equipChecked}<span className="text-[#86868b] text-[20px] font-semibold">/{equipment.length}</span>
            </p>
            <p className="text-[#86868b] text-[13px] mt-1">équipements relevés</p>
            {anomalies > 0 && (
              <p className="text-[#ff3b30] text-[13px] font-semibold mt-2">{anomalies} anomalie{anomalies > 1 ? 's' : ''}</p>
            )}
          </button>

          {/* Tasks card */}
          <button
            onClick={() => navigate('/tasks')}
            className="rounded-2xl bg-white dark:bg-[#1d1d1f] p-5 text-left active:opacity-80 transition-opacity ios-card-shadow"
          >
            <p className="text-[#86868b] text-[12px] font-semibold uppercase tracking-wide">Tâches</p>
            <p className="text-[36px] font-bold tracking-tight leading-none mt-2">
              {completedTasks}<span className="text-[#86868b] text-[20px] font-semibold">/{totalTasks}</span>
            </p>
            <p className="text-[#86868b] text-[13px] mt-1">complétées</p>
            {totalTasks > 0 && (
              <div className="mt-3">
                <div className="w-full h-1 rounded-full bg-[#e8e8ed] dark:bg-[#38383a]">
                  <div className="h-1 rounded-full bg-[#34c759] transition-all" style={{ width: `${taskProgress}%` }} />
                </div>
              </div>
            )}
          </button>

          {/* Traceability card */}
          <button
            onClick={() => navigate('/traceability')}
            className="rounded-2xl bg-white dark:bg-[#1d1d1f] p-5 text-left active:opacity-80 transition-opacity ios-card-shadow"
          >
            <p className="text-[#86868b] text-[12px] font-semibold uppercase tracking-wide">Traçabilité</p>
            <p className="text-[36px] font-bold tracking-tight leading-none mt-2">{products.length}</p>
            <p className="text-[#86868b] text-[13px] mt-1">produits récents</p>
            {expiringProducts.length > 0 && (
              <p className="text-[#ff9500] text-[13px] font-semibold mt-2">{expiringProducts.length} DLC proche{expiringProducts.length > 1 ? 's' : ''}</p>
            )}
          </button>

          {/* Invoices card */}
          <button
            onClick={() => navigate('/invoices')}
            className="rounded-2xl bg-white dark:bg-[#1d1d1f] p-5 text-left active:opacity-80 transition-opacity ios-card-shadow"
          >
            <p className="text-[#86868b] text-[12px] font-semibold uppercase tracking-wide">Factures</p>
            <p className="text-[36px] font-bold tracking-tight leading-none mt-2">{invoices.length}</p>
            <p className="text-[#86868b] text-[13px] mt-1">factures récentes</p>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-[21px] font-semibold mb-4">
          <span className="text-[#1d1d1f] dark:text-[#f5f5f7]">Actions rapides.</span>
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Saisir températures', path: '/temperature', color: 'bg-[#2997FF]' },
            { label: 'Scanner produit', path: '/traceability', color: 'bg-[#ac39ff]' },
            { label: 'Ajouter tâche', path: '/tasks', color: 'bg-[#34c759]' },
            { label: 'Scanner facture', path: '/invoices', color: 'bg-[#ff9500]' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className={`${action.color} rounded-2xl p-5 text-left active:opacity-80 transition-opacity`}
            >
              <p className="text-white text-[15px] font-semibold leading-tight">{action.label}</p>
              <svg className="mt-3 text-white/60" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
