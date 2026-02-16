import React, { useState, useCallback, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../../stores/appStore';
import { generateTemperaturePDF } from '../../services/pdf';
import TemperatureInput from '../../components/temperature/TemperatureInput';
import TemperatureHistory from '../../components/temperature/TemperatureHistory';
import EquipmentManager from '../../components/temperature/EquipmentManager';
import OilChangeTracker from '../../components/temperature/OilChangeTracker';
import { logger } from '../../services/logger';

const TemperatureChart = lazy(() => import('../../components/temperature/TemperatureChart'));
import { cn } from '../../utils';

type ControlCategory = 'cold' | 'oil';
type SubView = 'input' | 'history' | 'charts';

const CONTROL_CATEGORIES: { key: ControlCategory; label: string }[] = [
  { key: 'cold', label: 'Frigos' },
  { key: 'oil', label: 'Huile friteuse' },
];

const SUB_VIEWS: { key: SubView; label: string }[] = [
  { key: 'input', label: 'Saisie' },
  { key: 'history', label: 'Historique' },
  { key: 'charts', label: 'Graphiques' },
];

export default function TemperaturePage() {
  const [activeCategory, setActiveCategory] = useState<ControlCategory>('cold');
  const [activeView, setActiveView] = useState<SubView>('input');
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, 'yyyy-MM-dd');
  });
  const [exportTo, setExportTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [exportEquipmentId, setExportEquipmentId] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const equipment = useAppStore((s) => s.equipment);
  const settings = useAppStore((s) => s.settings);
  const getTemperatureRecords = useAppStore((s) => s.getTemperatureRecords);

  React.useEffect(() => {
    const quick = searchParams.get('quick');
    if (!quick) return;

    if (quick === 'history') {
      setActiveCategory('cold');
      setActiveView('history');
    }
    if (quick === 'charts') {
      setActiveCategory('cold');
      setActiveView('charts');
    }
    if (quick === 'input') {
      setActiveCategory('cold');
      setActiveView('input');
    }
    if (quick === 'oil') {
      setActiveCategory('oil');
      setShowExportPanel(false);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('quick');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const from = new Date(exportFrom);
      const to = new Date(exportTo);
      to.setHours(23, 59, 59, 999);

      const records = await getTemperatureRecords(from, to, exportEquipmentId || undefined);
      const periodLabel = `${format(from, 'dd/MM/yyyy', { locale: fr })} - ${format(to, 'dd/MM/yyyy', { locale: fr })}`;

      await generateTemperaturePDF(records, equipment, settings?.establishmentName ?? 'Mon etablissement', periodLabel);
      setShowExportPanel(false);
    } catch (err) {
      logger.error('PDF export error', { err });
    } finally {
      setExporting(false);
    }
  }, [equipment, settings, getTemperatureRecords, exportFrom, exportTo, exportEquipmentId]);

  return (
    <div className="app-page-wrap h-full pb-24">
      <div className="flex-shrink-0 space-y-3">
        <div className="glass-card glass-hero space-y-3 spx-scan-line animate-fade-in-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="ios-title app-text">Controles</h1>
              <p className="text-[11px] sm:text-[12px] app-muted">
                {activeCategory === 'cold'
                  ? 'Temperatures de froid & export HACCP.'
                  : 'Changements d huile friture (HACCP).'}
              </p>
            </div>
            {activeCategory === 'cold' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEquipmentModal(true)}
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-xl app-surface-2 app-text active:opacity-70 transition-opacity"
                  title="Equipements"
                  aria-label="Equipements"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowExportPanel((p) => !p)}
                  className={cn(
                    'flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-xl ios-caption sm:[font-size:15px] font-semibold transition-opacity active:opacity-70',
                    'app-accent-bg',
                  )}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  PDF
                </button>
              </div>
            )}
          </div>

          <div className="app-kpi-grid">
            {activeCategory === 'cold' ? (
              <>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Equipements froid</p>
                  <p className="app-kpi-value">{equipment.length}</p>
                </div>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Vue active</p>
                  <p className="app-kpi-value !text-[13px] sm:!text-[14px] font-semibold">{SUB_VIEWS.find((sv) => sv.key === activeView)?.label}</p>
                </div>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Debut export</p>
                  <p className="app-kpi-value ![font-size:12px] sm:![font-size:13px] font-semibold truncate">{exportFrom}</p>
                </div>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Fin export</p>
                  <p className="app-kpi-value ![font-size:12px] sm:![font-size:13px] font-semibold truncate">{exportTo}</p>
                </div>
              </>
            ) : (
              <>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Categorie</p>
                  <p className="app-kpi-value !text-[13px] sm:!text-[14px] font-semibold">Huile</p>
                </div>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Saisie</p>
                  <p className="app-kpi-value !text-[13px] sm:!text-[14px] font-semibold">Par calendrier</p>
                </div>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Trace</p>
                  <p className="app-kpi-value !text-[13px] sm:!text-[14px] font-semibold">Historique</p>
                </div>
                <div className="glass-card glass-kpi">
                  <p className="app-kpi-label">Export</p>
                  <p className="app-kpi-value !text-[13px] sm:!text-[14px] font-semibold">PDF</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pill-toggle glass-card">
          {CONTROL_CATEGORIES.map((category) => (
            <button
              key={category.key}
              onClick={() => {
                setActiveCategory(category.key);
                if (category.key === 'oil') setShowExportPanel(false);
              }}
              className={cn('pill-toggle-btn', activeCategory === category.key && 'active')}
            >
              {category.label}
            </button>
          ))}
        </div>

        {activeCategory === 'cold' && showExportPanel && (
          <div className="glass-card glass-panel space-y-3 animate-fade-in-up stagger-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block ios-caption font-medium app-muted mb-1">Du</label>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="app-input" />
              </div>
              <div>
                <label className="block ios-caption font-medium app-muted mb-1">Au</label>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="app-input" />
              </div>
            </div>
            <div>
              <label className="block ios-caption font-medium app-muted mb-1">Equipement</label>
              <select value={exportEquipmentId} onChange={(e) => setExportEquipmentId(e.target.value)} className="app-input">
                <option value="">Tous les equipements</option>
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className={cn(
                'w-full py-2.5 rounded-xl text-[14px] font-bold transition-opacity active:opacity-70',
                exporting ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
              )}
            >
              {exporting ? 'Generation...' : 'Generer le PDF'}
            </button>
          </div>
        )}

        {activeCategory === 'cold' && (
          <div className="pill-toggle glass-card">
            {SUB_VIEWS.map((sv) => (
              <button key={sv.key} onClick={() => setActiveView(sv.key)} className={cn('pill-toggle-btn', activeView === sv.key && 'active')}>
                {sv.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {activeCategory === 'cold' && activeView === 'input' && <TemperatureInput />}
        {activeCategory === 'cold' && activeView === 'history' && <TemperatureHistory />}
        {activeCategory === 'cold' && activeView === 'charts' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <TemperatureChart />
          </Suspense>
        )}
        {activeCategory === 'oil' && <OilChangeTracker establishmentName={settings?.establishmentName} />}
      </div>

      {activeCategory === 'cold' && showEquipmentModal && <EquipmentManager onClose={() => setShowEquipmentModal(false)} />}
    </div>
  );
}


