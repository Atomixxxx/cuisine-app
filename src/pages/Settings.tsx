import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { showError, showSuccess, showWarning } from '../stores/toastStore';
import { getApiKey, setApiKey, hasApiKey } from '../services/ocr';
import { db, getStorageEstimate, type StorageEstimate } from '../services/db';
import { cn } from '../utils';
import ConfirmDialog from '../components/common/ConfirmDialog';
import {
  buildBackupPayload,
  downloadBackup,
  exportStoredAutoBackup,
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  validateBackupImportPayload,
} from '../services/backup';
import {
  isPinConfigured,
  isPinFormatValid,
  normalizePinInput,
  removePinCode,
  setPinCode,
  verifyPinCode,
} from '../services/pin';
import { STORAGE_KEYS } from '../constants/storageKeys';
import {
  getSupabaseSession,
  isSupabaseAuthConfigured,
  signInSupabase,
  signOutSupabase,
} from '../services/supabaseAuth';

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [establishmentName, setEstablishmentName] = useState('');
  const [priceThreshold, setPriceThreshold] = useState('10');
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [supabaseEmail, setSupabaseEmail] = useState('');
  const [supabasePassword, setSupabasePassword] = useState('');
  const [supabaseUserEmail, setSupabaseUserEmail] = useState<string | null>(null);
  const [supabaseSigningIn, setSupabaseSigningIn] = useState(false);
  const [supabaseSigningOut, setSupabaseSigningOut] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageWarnedRef = useRef(false);
  const supabaseAuthConfigured = isSupabaseAuthConfigured();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setEstablishmentName(settings.establishmentName);
      setPriceThreshold(String(settings.priceAlertThreshold));
    }
    setAutoBackup(isAutoBackupEnabled());
    setPinEnabled(isPinConfigured());
    getApiKey().then((k) => setGeminiKey(k));
    hasApiKey().then((v) => setGeminiConnected(v));
    const session = getSupabaseSession();
    setSupabaseUserEmail(session?.email ?? null);
  }, [settings]);

  const refreshStorage = useCallback(async () => {
    const estimate = await getStorageEstimate();
    setStorageEstimate(estimate);
    if (!estimate) return;
    if (estimate.usagePercent >= 80 && !storageWarnedRef.current) {
      showWarning('Stockage local utilise a plus de 80%');
      storageWarnedRef.current = true;
    }
    if (estimate.usagePercent < 75) {
      storageWarnedRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
    const timer = window.setInterval(() => {
      void refreshStorage();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshStorage]);

  const handleSaveSettings = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSettings({
        establishmentName: establishmentName.trim() || 'Mon Etablissement',
        priceAlertThreshold: Math.max(1, parseInt(priceThreshold, 10) || 10),
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
    if (trimmed) showSuccess('Cle API Gemini enregistree');
    else showSuccess('Cle API Gemini supprimee');
  }, [geminiKey]);

  const handleSupabaseLogin = useCallback(async () => {
    const email = supabaseEmail.trim();
    const password = supabasePassword.trim();
    if (!email || !password) {
      showError('Email et mot de passe requis');
      return;
    }

    setSupabaseSigningIn(true);
    try {
      const session = await signInSupabase(email, password);
      setSupabaseUserEmail(session.email ?? email);
      setSupabasePassword('');
      await loadSettings();
      showSuccess('Connexion Supabase reussie');
    } catch {
      showError('Connexion Supabase impossible');
    } finally {
      setSupabaseSigningIn(false);
    }
  }, [supabaseEmail, supabasePassword, loadSettings]);

  const handleSupabaseLogout = useCallback(async () => {
    setSupabaseSigningOut(true);
    try {
      await signOutSupabase();
      setSupabaseUserEmail(null);
      setSupabasePassword('');
      showSuccess('Session Supabase deconnectee');
    } catch {
      showError('Deconnexion Supabase impossible');
    } finally {
      setSupabaseSigningOut(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const payload = await buildBackupPayload();
      downloadBackup(payload);
      showSuccess('Sauvegarde exportee');
    } catch {
      showError("Erreur lors de l'export");
    }
  }, []);

  const restoreBackupFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        const data = validateBackupImportPayload(raw);
        if (!data) {
          showError('Fichier de sauvegarde invalide');
          return;
        }

        await db.transaction(
          'rw',
          [db.equipment, db.temperatureRecords, db.oilChangeRecords, db.tasks, db.productTraces, db.invoices, db.priceHistory, db.settings],
          async () => {
            await db.equipment.clear();
            await db.temperatureRecords.clear();
            await db.oilChangeRecords.clear();
            await db.tasks.clear();
            await db.productTraces.clear();
            await db.invoices.clear();
            await db.priceHistory.clear();
            await db.settings.clear();

            if (data.equipment?.length) await db.equipment.bulkAdd(data.equipment);
            if (data.temperatureRecords?.length) await db.temperatureRecords.bulkAdd(data.temperatureRecords);
            if (data.oilChangeRecords?.length) await db.oilChangeRecords.bulkAdd(data.oilChangeRecords);
            if (data.tasks?.length) await db.tasks.bulkAdd(data.tasks);
            if (data.productTraces?.length) await db.productTraces.bulkAdd(data.productTraces);
            if (data.invoices?.length) await db.invoices.bulkAdd(data.invoices);
            if (data.priceHistory?.length) await db.priceHistory.bulkAdd(data.priceHistory);
            if (data.settings?.length) await db.settings.bulkAdd(data.settings);
          },
        );

        await loadSettings();
        await refreshStorage();
        localStorage.setItem(STORAGE_KEYS.backupLastAt, new Date().toISOString());
        window.dispatchEvent(new Event('cuisine-backup-updated'));
        showSuccess('Sauvegarde restauree avec succes');
      } catch {
        showError("Erreur lors de l'import. Verifiez le fichier.");
      } finally {
        setRestoringBackup(false);
        setPendingImportFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [loadSettings, refreshStorage],
  );

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    setConfirmImportOpen(true);
  }, []);

  const handleCancelImport = useCallback(() => {
    setConfirmImportOpen(false);
    setPendingImportFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleConfirmImport = useCallback(() => {
    if (!pendingImportFile || restoringBackup) return;
    setConfirmImportOpen(false);
    setRestoringBackup(true);
    void restoreBackupFile(pendingImportFile);
  }, [pendingImportFile, restoringBackup, restoreBackupFile]);

  const handleToggleAutoBackup = useCallback(() => {
    const next = !autoBackup;
    setAutoBackupEnabled(next);
    setAutoBackup(next);
    showSuccess(next ? 'Backup auto hebdomadaire active' : 'Backup auto hebdomadaire desactive');
  }, [autoBackup]);

  const handleExportAutoBackup = useCallback(() => {
    const exportAuto = async () => {
      if (!(await exportStoredAutoBackup())) {
        showError('Aucun backup auto disponible pour le moment');
        return;
      }
      showSuccess('Backup auto exporte');
    };
    void exportAuto();
  }, []);

  const setPinField = (setter: (v: string) => void) => (value: string) => {
    setter(normalizePinInput(value));
  };

  const handleEnablePin = useCallback(() => {
    const enable = async () => {
      if (!isPinFormatValid(newPin)) {
        showError('Le code PIN doit contenir 4 chiffres');
        return;
      }
      if (newPin !== confirmPin) {
        showError('La confirmation du PIN ne correspond pas');
        return;
      }
      try {
        await setPinCode(newPin);
        setPinEnabled(true);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        showSuccess('Code PIN active');
      } catch {
        showError('Impossible d activer le PIN');
      }
    };
    void enable();
  }, [newPin, confirmPin]);

  const handleDisablePin = useCallback(() => {
    const disable = async () => {
      try {
        const valid = await verifyPinCode(currentPin);
        if (!valid) {
          showError('PIN actuel incorrect');
          return;
        }
        await removePinCode();
        setPinEnabled(false);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        showSuccess('Code PIN desactive');
      } catch {
        showError('Impossible de desactiver le PIN');
      }
    };
    void disable();
  }, [currentPin]);

  const handleChangePin = useCallback(() => {
    const change = async () => {
      try {
        const valid = await verifyPinCode(currentPin);
        if (!valid) {
          showError('PIN actuel incorrect');
          return;
        }
        if (!isPinFormatValid(newPin)) {
          showError('Le nouveau PIN doit contenir 4 chiffres');
          return;
        }
        if (newPin !== confirmPin) {
          showError('La confirmation du PIN ne correspond pas');
          return;
        }
        await setPinCode(newPin);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        showSuccess('Code PIN modifie');
      } catch {
        showError('Impossible de modifier le PIN');
      }
    };
    void change();
  }, [currentPin, newPin, confirmPin]);

  const inputClass = 'app-input text-[17px]';
  const usagePercent = Math.min(100, Math.max(0, storageEstimate?.usagePercent ?? 0));

  const formatStorageBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="app-page-wrap max-w-2xl pb-28 space-y-4">
      <div className="app-hero-card space-y-3">
        <div>
          <h1 className="ios-title app-text">Parametres</h1>
          <p className="text-[14px] app-muted">Configuration generale, API, sauvegardes et securite.</p>
        </div>
        <div className="app-kpi-grid">
          <div className="app-kpi-card">
            <p className="app-kpi-label">Etablissement</p>
            <p className="app-kpi-value text-[16px] font-semibold truncate">{establishmentName || 'Non renseigne'}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Gemini API</p>
            <p className="app-kpi-value text-[16px] font-semibold">{geminiConnected ? 'Connecte' : 'Inactif'}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Backup auto</p>
            <p className="app-kpi-value text-[16px] font-semibold">{autoBackup ? 'Actif' : 'Off'}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Code PIN</p>
            <p className="app-kpi-value text-[16px] font-semibold">{pinEnabled ? 'Actif' : 'Off'}</p>
          </div>
          <div className="app-kpi-card">
            <p className="app-kpi-label">Cloud</p>
            <p className="app-kpi-value text-[16px] font-semibold">
              {supabaseAuthConfigured ? (supabaseUserEmail ? 'Connecte' : 'Pret') : 'Non configure'}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="ios-caption-upper app-muted mb-2">General</h2>
        <div className="rounded-2xl app-panel overflow-hidden">
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">Nom de l'etablissement</label>
            <input
              type="text"
              value={establishmentName}
              onChange={(e) => setEstablishmentName(e.target.value)}
              placeholder="Mon Restaurant"
              className={inputClass}
            />
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">Seuil alerte prix (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={priceThreshold}
              onChange={(e) => setPriceThreshold(e.target.value)}
              className={inputClass}
            />
            <p className="ios-caption app-muted">Alerte si la variation de prix depasse ce pourcentage</p>
          </div>
          <div className="px-4 py-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className={cn(
                'w-full py-3 rounded-xl text-[17px] font-semibold transition-opacity active:opacity-70',
                saving ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
              )}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="ios-caption-upper app-muted mb-2">API Gemini</h2>
        <div className="rounded-2xl app-panel overflow-hidden">
          <div className="ios-settings-row">
            <span className="text-[17px] app-text">Statut</span>
            <span
              className={cn(
                'flex items-center gap-1.5 ios-body font-medium',
                geminiConnected ? 'text-[color:var(--app-success)]' : 'app-muted',
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  geminiConnected ? 'bg-[color:var(--app-success)]' : 'app-surface-3',
                )}
              />
              {geminiConnected ? 'Connecte' : 'Non configure'}
            </span>
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">Cle API</label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className={inputClass}
            />
            <p className="ios-caption app-muted">Necessaire pour l'analyse des factures par IA</p>
          </div>
          <div className="px-4 py-3">
            <button
              onClick={handleSaveGeminiKey}
              className="w-full py-3 rounded-xl app-accent-bg text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              Enregistrer la cle
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="ios-caption-upper app-muted mb-2">Cloud Supabase</h2>
        <div className="rounded-2xl app-panel overflow-hidden">
          <div className="ios-settings-row">
            <span className="text-[17px] app-text">Configuration</span>
            <span className={cn('ios-body font-medium', supabaseAuthConfigured ? 'text-[color:var(--app-success)]' : 'app-muted')}>
              {supabaseAuthConfigured ? 'Variables OK' : 'Variables manquantes'}
            </span>
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row">
            <span className="text-[17px] app-text">Session</span>
            <span className={cn('ios-body font-medium', supabaseUserEmail ? 'text-[color:var(--app-success)]' : 'app-muted')}>
              {supabaseUserEmail ?? 'Non connecte'}
            </span>
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">Email Supabase</label>
            <input
              type="email"
              value={supabaseEmail}
              onChange={(e) => setSupabaseEmail(e.target.value)}
              placeholder="utilisateur@domaine.com"
              className={inputClass}
            />
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">Mot de passe Supabase</label>
            <input
              type="password"
              value={supabasePassword}
              onChange={(e) => setSupabasePassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <div className="px-4 py-3 flex gap-3">
            <button
              onClick={handleSupabaseLogin}
              disabled={!supabaseAuthConfigured || supabaseSigningIn}
              className={cn(
                'flex-1 py-3 rounded-xl text-[16px] font-semibold active:opacity-70 transition-opacity',
                !supabaseAuthConfigured || supabaseSigningIn ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
              )}
            >
              {supabaseSigningIn ? 'Connexion...' : 'Se connecter'}
            </button>
            <button
              onClick={handleSupabaseLogout}
              disabled={!supabaseUserEmail || supabaseSigningOut}
              className={cn(
                'flex-1 py-3 rounded-xl text-[16px] font-semibold active:opacity-70 transition-opacity',
                !supabaseUserEmail || supabaseSigningOut ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-danger-bg',
              )}
            >
              {supabaseSigningOut ? 'Deconnexion...' : 'Se deconnecter'}
            </button>
          </div>
          <div className="px-4 pb-4 ios-caption app-muted">
            Utilise ce login pour le mode securise RLS. En mode simple, la synchro peut fonctionner sans login.
          </div>
        </div>
      </div>

      <div>
        <h2 className="ios-caption-upper app-muted mb-2">Sauvegarde</h2>
        <div className="rounded-2xl app-panel overflow-hidden">
          <div className="ios-settings-row">
            <p className="ios-body app-muted">
              Exportez vos donnees pour les sauvegarder ou les transferer. Les photos ne sont pas incluses.
            </p>
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row">
            <span className="text-[17px] app-text">Backup auto hebdomadaire</span>
            <button
              onClick={handleToggleAutoBackup}
              className={cn(
                'px-3 py-1.5 rounded-full ios-caption font-semibold transition-opacity active:opacity-70',
                autoBackup ? 'app-success-bg' : 'app-surface-2 app-muted',
              )}
            >
              {autoBackup ? 'Active' : 'Desactive'}
            </button>
          </div>
          <div className="ios-settings-separator" />
          <div className="px-4 py-3 flex gap-3">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl app-success-bg text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              Exporter
            </button>
            <button
              onClick={handleExportAutoBackup}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl app-surface-2 app-text text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              Export auto
            </button>
          </div>
          <div className="ios-settings-separator" />
          <div className="px-4 py-3">
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoringBackup}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl app-warning-bg text-[17px] font-semibold active:opacity-70 transition-opacity"
            >
              {restoringBackup ? 'Restauration...' : 'Importer'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="ios-caption-upper app-muted mb-2">Stockage local</h2>
        <div className="rounded-2xl app-panel overflow-hidden">
          <div className="ios-settings-row flex-col items-stretch gap-2">
            {storageEstimate ? (
              <>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="app-text">Utilisation</span>
                  <span className={cn('font-semibold', usagePercent >= 80 ? 'text-[color:var(--app-warning)]' : 'app-muted')}>
                    {usagePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full app-surface-2 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      usagePercent >= 80 ? 'bg-[color:var(--app-warning)]' : 'bg-[color:var(--app-accent)]',
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <div className="ios-caption app-muted">
                  {formatStorageBytes(storageEstimate.usage)} / {formatStorageBytes(storageEstimate.quota)}
                </div>
              </>
            ) : (
              <p className="text-[14px] app-muted">Estimation du stockage indisponible sur cet appareil.</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="ios-caption-upper app-muted mb-2">Securite</h2>
        <div className="rounded-2xl app-panel overflow-hidden">
          <div className="ios-settings-row">
            <span className="text-[17px] app-text">Code PIN</span>
            <span className={cn('ios-body font-medium', pinEnabled ? 'text-[color:var(--app-success)]' : 'app-muted')}>
              {pinEnabled ? 'Active' : 'Desactive'}
            </span>
          </div>
          <div className="ios-settings-separator" />
          {pinEnabled && (
            <>
              <div className="ios-settings-row flex-col items-stretch gap-1.5">
                <label className="text-[17px] app-text">PIN actuel</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) => setPinField(setCurrentPin)(e.target.value)}
                  placeholder="0000"
                  className={inputClass}
                />
              </div>
              <div className="ios-settings-separator" />
            </>
          )}
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">{pinEnabled ? 'Nouveau PIN' : 'PIN'}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setPinField(setNewPin)(e.target.value)}
              placeholder="0000"
              className={inputClass}
            />
          </div>
          <div className="ios-settings-separator" />
          <div className="ios-settings-row flex-col items-stretch gap-1.5">
            <label className="text-[17px] app-text">Confirmation PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setPinField(setConfirmPin)(e.target.value)}
              placeholder="0000"
              className={inputClass}
            />
          </div>
          <div className="px-4 py-3 flex gap-3">
            {pinEnabled ? (
              <>
                <button
                  onClick={handleChangePin}
                  className="flex-1 py-3 rounded-xl app-accent-bg text-[16px] font-semibold active:opacity-70 transition-opacity"
                >
                  Changer PIN
                </button>
                <button
                  onClick={handleDisablePin}
                  className="flex-1 py-3 rounded-xl app-danger-bg text-[16px] font-semibold active:opacity-70 transition-opacity"
                >
                  Desactiver
                </button>
              </>
            ) : (
              <button
                onClick={handleEnablePin}
                className="w-full py-3 rounded-xl app-accent-bg text-[16px] font-semibold active:opacity-70 transition-opacity"
              >
                Activer le PIN
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="text-center ios-caption app-muted py-4">
        <p>CuisineControl v1.0</p>
        <p className="mt-1">Gestion HACCP pour la restauration</p>
      </div>

      <ConfirmDialog
        isOpen={confirmImportOpen}
        onCancel={handleCancelImport}
        onConfirm={handleConfirmImport}
        title="Restaurer la sauvegarde ?"
        message="Cette action remplacera toutes vos donnees actuelles. Cette operation est irreversible."
        confirmText="Oui, restaurer"
        cancelText="Annuler"
        variant="danger"
      />
    </div>
  );
}

