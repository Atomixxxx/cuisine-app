import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { useAppStore } from '../stores/appStore';
import { showError, showSuccess, showWarning } from '../stores/toastStore';
import { getApiKey, setApiKey, hasApiKey } from '../services/ocr';
import { db, getStorageEstimate, type StorageEstimate } from '../services/db';
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
  restoreSession,
  signInSupabase,
  signOutSupabase,
} from '../services/supabaseAuth';
import SettingsHeader from '../components/settings/SettingsHeader';
import GeneralSettingsSection from '../components/settings/GeneralSettingsSection';
import ApiSettingsSection from '../components/settings/ApiSettingsSection';
import CloudSettingsSection from '../components/settings/CloudSettingsSection';
import BackupSettingsSection from '../components/settings/BackupSettingsSection';
import StorageSettingsSection from '../components/settings/StorageSettingsSection';
import SecuritySettingsSection from '../components/settings/SecuritySettingsSection';

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
  const [mediaIntegrity, setMediaIntegrity] = useState({
    missingProducts: 0,
    missingInvoices: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageWarnedRef = useRef(false);
  const mediaWarnedRef = useRef(false);
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
    // Tenter de restaurer la session (refresh si token expiré)
    restoreSession().then(() => {
      const session = getSupabaseSession();
      setSupabaseUserEmail(session?.email ?? null);
    });
  }, [settings]);

  const refreshStorage = useCallback(async () => {
    const [estimate, missingProducts, missingInvoices] = await Promise.all([
      getStorageEstimate(),
      db.productTraces.filter((product) => !product.photo && !product.photoUrl).count(),
      db.invoices
        .filter((invoice) => {
          const hasLocalImages = Array.isArray(invoice.images) && invoice.images.length > 0;
          const hasCloudImages = Array.isArray(invoice.imageUrls) && invoice.imageUrls.length > 0;
          return !hasLocalImages && !hasCloudImages;
        })
        .count(),
    ]);
    setStorageEstimate(estimate);
    setMediaIntegrity({ missingProducts, missingInvoices });

    const missingMediaTotal = missingProducts + missingInvoices;
    if (missingMediaTotal > 0 && !mediaWarnedRef.current) {
      showWarning(`${missingMediaTotal} element(s) sans media local ni URL cloud`);
      mediaWarnedRef.current = true;
    }
    if (missingMediaTotal === 0) {
      mediaWarnedRef.current = false;
    }

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

  const handleImport = useCallback((e: ChangeEvent<HTMLInputElement>) => {
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

  const inputClass = 'app-input text-[14px]';
  const usagePercent = Math.min(100, Math.max(0, storageEstimate?.usagePercent ?? 0));
  const missingMediaTotal = mediaIntegrity.missingProducts + mediaIntegrity.missingInvoices;

  const formatStorageBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="app-page-wrap pb-28 space-y-3">
      <SettingsHeader
        establishmentName={establishmentName}
        geminiConnected={geminiConnected}
        autoBackup={autoBackup}
        pinEnabled={pinEnabled}
        supabaseAuthConfigured={supabaseAuthConfigured}
        supabaseUserEmail={supabaseUserEmail}
      />

      <GeneralSettingsSection
        inputClass={inputClass}
        establishmentName={establishmentName}
        priceThreshold={priceThreshold}
        saving={saving}
        onEstablishmentNameChange={setEstablishmentName}
        onPriceThresholdChange={setPriceThreshold}
        onSave={handleSaveSettings}
      />

      <ApiSettingsSection
        inputClass={inputClass}
        geminiConnected={geminiConnected}
        geminiKey={geminiKey}
        onGeminiKeyChange={setGeminiKey}
        onSave={handleSaveGeminiKey}
      />

      <CloudSettingsSection
        inputClass={inputClass}
        supabaseAuthConfigured={supabaseAuthConfigured}
        supabaseUserEmail={supabaseUserEmail}
        supabaseEmail={supabaseEmail}
        supabasePassword={supabasePassword}
        supabaseSigningIn={supabaseSigningIn}
        supabaseSigningOut={supabaseSigningOut}
        onSupabaseEmailChange={setSupabaseEmail}
        onSupabasePasswordChange={setSupabasePassword}
        onLogin={handleSupabaseLogin}
        onLogout={handleSupabaseLogout}
      />

      <BackupSettingsSection
        fileInputRef={fileInputRef}
        missingMediaTotal={missingMediaTotal}
        mediaIntegrity={mediaIntegrity}
        autoBackup={autoBackup}
        restoringBackup={restoringBackup}
        onToggleAutoBackup={handleToggleAutoBackup}
        onExport={handleExport}
        onExportAutoBackup={handleExportAutoBackup}
        onImportFileChange={handleImport}
      />

      <StorageSettingsSection
        storageEstimate={storageEstimate}
        usagePercent={usagePercent}
        formatStorageBytes={formatStorageBytes}
      />

      <SecuritySettingsSection
        inputClass={inputClass}
        pinEnabled={pinEnabled}
        currentPin={currentPin}
        newPin={newPin}
        confirmPin={confirmPin}
        onCurrentPinChange={setPinField(setCurrentPin)}
        onNewPinChange={setPinField(setNewPin)}
        onConfirmPinChange={setPinField(setConfirmPin)}
        onEnablePin={handleEnablePin}
        onDisablePin={handleDisablePin}
        onChangePin={handleChangePin}
      />

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
