import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { showError, showSuccess } from '../stores/toastStore';
import { getApiKey, setApiKey, hasApiKey } from '../services/ocr';
import { db } from '../services/db';
import { cn } from '../utils';

export default function Settings() {
  const settings = useAppStore(s => s.settings);
  const loadSettings = useAppStore(s => s.loadSettings);
  const updateSettings = useAppStore(s => s.updateSettings);

  const [establishmentName, setEstablishmentName] = useState('');
  const [priceThreshold, setPriceThreshold] = useState('10');
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setEstablishmentName(settings.establishmentName);
      setPriceThreshold(String(settings.priceAlertThreshold));
    }
    getApiKey().then(k => setGeminiKey(k));
    hasApiKey().then(v => setGeminiConnected(v));
  }, [settings]);

  const handleSaveSettings = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSettings({
        establishmentName: establishmentName.trim() || 'Mon Etablissement',
        priceAlertThreshold: Math.max(1, parseInt(priceThreshold) || 10),
      });
      showSuccess('Parametres enregistres');
    } catch {
      showError('Impossible de sauvegarder les parametres');
    } finally {
      setSaving(false);
    }
  }, [saving, establishmentName, priceThreshold, updateSettings]);

  const handleSaveGeminiKey = useCallback(async () => {
    const trimmed = geminiKey.trim();
    await setApiKey(trimmed);
    setGeminiConnected(trimmed.length > 0);
    if (trimmed) {
      showSuccess('Cle API Gemini enregistree');
    } else {
      showSuccess('Cle API Gemini supprimee');
    }
  }, [geminiKey]);

  // ── Backup / Restore ──

  const handleExport = useCallback(async () => {
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        equipment: await db.equipment.toArray(),
        temperatureRecords: await db.temperatureRecords.toArray(),
        tasks: await db.tasks.toArray(),
        productTraces: (await db.productTraces.toArray()).map(p => ({
          ...p,
          photo: undefined, // Blobs can't be serialized to JSON
        })),
        invoices: (await db.invoices.toArray()).map(i => ({
          ...i,
          images: [], // Blobs can't be serialized to JSON
        })),
        priceHistory: await db.priceHistory.toArray(),
        settings: await db.settings.toArray(),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cuisine-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Sauvegarde exportee');
    } catch {
      showError('Erreur lors de l\'export');
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.equipment) {
        showError('Fichier de sauvegarde invalide');
        return;
      }

      // Clear existing data and import
      await db.transaction('rw',
        db.equipment, db.temperatureRecords, db.tasks,
        db.productTraces, db.invoices, db.priceHistory, db.settings,
        async () => {
          await db.equipment.clear();
          await db.temperatureRecords.clear();
          await db.tasks.clear();
          await db.productTraces.clear();
          await db.invoices.clear();
          await db.priceHistory.clear();
          await db.settings.clear();

          if (data.equipment?.length) await db.equipment.bulkAdd(data.equipment);
          if (data.temperatureRecords?.length) await db.temperatureRecords.bulkAdd(data.temperatureRecords);
          if (data.tasks?.length) await db.tasks.bulkAdd(data.tasks);
          if (data.productTraces?.length) await db.productTraces.bulkAdd(data.productTraces);
          if (data.invoices?.length) await db.invoices.bulkAdd(data.invoices);
          if (data.priceHistory?.length) await db.priceHistory.bulkAdd(data.priceHistory);
          if (data.settings?.length) await db.settings.bulkAdd(data.settings);
        }
      );

      await loadSettings();
      showSuccess('Sauvegarde restauree avec succes');
    } catch {
      showError('Erreur lors de l\'import. Verifiez le fichier.');
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [loadSettings]);

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] text-[17px] border-0 focus:outline-none focus:ring-2 focus:ring-[#2997FF] dark:focus:ring-[#2997FF]';

  return (
    <div className="px-5 py-6 space-y-8 max-w-2xl mx-auto">
      <h1 className="ios-title text-[#1d1d1f] dark:text-[#f5f5f7]">Parametres</h1>

      {/* General settings */}
      <div>
        <h2 className="ios-caption-upper text-[#86868b] mb-2 px-4">General</h2>
        <div className="bg-white dark:bg-[#1d1d1f] rounded-2xl ios-card-shadow overflow-hidden">
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] text-[#1d1d1f] dark:text-[#f5f5f7]">Nom de l'etablissement</label>
            <input
              type="text"
              value={establishmentName}
              onChange={e => setEstablishmentName(e.target.value)}
              placeholder="Mon Restaurant"
              className={inputClass}
            />
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] text-[#1d1d1f] dark:text-[#f5f5f7]">Seuil alerte prix (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={priceThreshold}
              onChange={e => setPriceThreshold(e.target.value)}
              className={inputClass}
            />
            <p className="text-[13px] text-[#86868b]">
              Alerte si la variation de prix depasse ce pourcentage
            </p>
          </div>
          <div className="px-4 py-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className={cn(
                'w-full py-3 rounded-xl text-[17px] font-semibold transition-opacity active:opacity-70',
                saving ? 'bg-[#e8e8ed] dark:bg-[#38383a] text-[#86868b] cursor-not-allowed' : 'bg-[#2997FF] text-white'
              )}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      {/* Gemini API */}
      <div>
        <h2 className="ios-caption-upper text-[#86868b] mb-2 px-4">API Gemini</h2>
        <div className="bg-white dark:bg-[#1d1d1f] rounded-2xl ios-card-shadow overflow-hidden">
          <div className="ios-settings-row">
            <span className="text-[17px] text-[#1d1d1f] dark:text-[#f5f5f7]">Statut</span>
            <span className={cn(
              'flex items-center gap-1.5 text-[15px] font-medium',
              geminiConnected ? 'text-[#34c759]' : 'text-[#86868b]'
            )}>
              <span className={cn('w-2 h-2 rounded-full', geminiConnected ? 'bg-[#34c759]' : 'bg-[#d1d1d6] dark:bg-[#38383a]')} />
              {geminiConnected ? 'Connecte' : 'Non configure'}
            </span>
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] text-[#1d1d1f] dark:text-[#f5f5f7]">Cle API</label>
            <input
              type="password"
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className={inputClass}
            />
            <p className="text-[13px] text-[#86868b]">
              Necessaire pour l'analyse des factures par IA
            </p>
          </div>
          <div className="px-4 py-3">
            <button
              onClick={handleSaveGeminiKey}
              className="w-full py-3 rounded-xl bg-[#ac39ff] text-white text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              Enregistrer la cle
            </button>
          </div>
        </div>
      </div>

      {/* Backup / Restore */}
      <div>
        <h2 className="ios-caption-upper text-[#86868b] mb-2 px-4">Sauvegarde</h2>
        <div className="bg-white dark:bg-[#1d1d1f] rounded-2xl ios-card-shadow overflow-hidden">
          <div className="ios-settings-row">
            <p className="text-[15px] text-[#86868b]">
              Exportez vos donnees pour les sauvegarder ou les transferer. Les photos ne sont pas incluses.
            </p>
          </div>
          <div className="ios-settings-separator" />
          <div className="px-4 py-3 flex gap-3">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#34c759] text-white text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exporter
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#ff9500] text-white text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importer
            </button>
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="text-center text-[13px] text-[#86868b] py-4">
        <p>CuisineControl v1.0</p>
        <p className="mt-1">Gestion HACCP pour la restauration</p>
      </div>
    </div>
  );
}
