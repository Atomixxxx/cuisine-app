import React, { useState, useCallback, Suspense, lazy } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppStore } from '../../stores/appStore';
import { generateTemperaturePDF } from '../../services/pdf';
import TemperatureInput from '../../components/temperature/TemperatureInput';
import TemperatureHistory from '../../components/temperature/TemperatureHistory';
import EquipmentManager from '../../components/temperature/EquipmentManager';

const TemperatureChart = lazy(() => import('../../components/temperature/TemperatureChart'));
import { cn } from '../../utils';

type SubView = 'input' | 'history' | 'charts';

const SUB_VIEWS: { key: SubView; label: string }[] = [
  { key: 'input', label: 'Saisie' },
  { key: 'history', label: 'Historique' },
  { key: 'charts', label: 'Graphiques' },
];

export default function TemperaturePage() {
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

  const equipment = useAppStore(s => s.equipment);
  const settings = useAppStore(s => s.settings);
  const getTemperatureRecords = useAppStore(s => s.getTemperatureRecords);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const from = new Date(exportFrom);
      const to = new Date(exportTo);
      to.setHours(23, 59, 59, 999);

      const records = await getTemperatureRecords(from, to, exportEquipmentId || undefined);
      const periodLabel = `${format(from, 'dd/MM/yyyy', { locale: fr })} - ${format(to, 'dd/MM/yyyy', { locale: fr })}`;

      generateTemperaturePDF(records, equipment, settings?.establishmentName ?? 'Mon établissement', periodLabel);
      setShowExportPanel(false);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setExporting(false);
    }
  }, [equipment, settings, getTemperatureRecords, exportFrom, exportTo, exportEquipmentId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-4">
          <h1 className="ios-title text-[#1d1d1f] dark:text-[#f5f5f7]">Températures</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEquipmentModal(true)}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#86868b] active:opacity-70 transition-opacity"
              title="Équipements"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowExportPanel(p => !p)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-[15px] font-semibold transition-opacity active:opacity-70',
                showExportPanel
                  ? 'bg-[#2997FF] text-white'
                  : 'bg-[#2997FF] text-white'
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        {/* Export panel */}
        {showExportPanel && (
          <div className="mb-4 p-4 bg-white dark:bg-[#1d1d1f] rounded-2xl ios-card-shadow space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[#86868b] mb-1">Du</label>
                <input
                  type="date"
                  value={exportFrom}
                  onChange={e => setExportFrom(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#86868b] mb-1">Au</label>
                <input
                  type="date"
                  value={exportTo}
                  onChange={e => setExportTo(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#86868b] mb-1">Équipement</label>
              <select
                value={exportEquipmentId}
                onChange={e => setExportEquipmentId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-[15px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF]"
              >
                <option value="">Tous les équipements</option>
                {equipment.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className={cn(
                'w-full py-3 rounded-xl text-[17px] font-bold transition-opacity active:opacity-70',
                exporting
                  ? 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b] cursor-not-allowed'
                  : 'bg-[#2997FF] text-white'
              )}
            >
              {exporting ? 'Génération...' : 'Générer le PDF'}
            </button>
          </div>
        )}

        {/* iOS Segmented Control */}
        <div className="ios-segmented">
          {SUB_VIEWS.map(sv => (
            <button
              key={sv.key}
              onClick={() => setActiveView(sv.key)}
              className={cn('ios-segmented-item', activeView === sv.key && 'active')}
            >
              {sv.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeView === 'input' && <TemperatureInput />}
        {activeView === 'history' && <TemperatureHistory />}
        {activeView === 'charts' && (
          <Suspense fallback={<div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-[#2997FF] border-t-transparent rounded-full animate-spin" /></div>}>
            <TemperatureChart />
          </Suspense>
        )}
      </div>

      {/* Equipment modal */}
      {showEquipmentModal && (
        <EquipmentManager onClose={() => setShowEquipmentModal(false)} />
      )}
    </div>
  );
}
