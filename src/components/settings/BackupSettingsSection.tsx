import type { ChangeEvent, RefObject } from 'react';
import { cn } from '../../utils';

interface MediaIntegrityState {
  missingProducts: number;
  missingInvoices: number;
}

interface BackupSettingsSectionProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  missingMediaTotal: number;
  mediaIntegrity: MediaIntegrityState;
  autoBackup: boolean;
  restoringBackup: boolean;
  onToggleAutoBackup: () => void;
  onExport: () => void;
  onExportAutoBackup: () => void;
  onImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export default function BackupSettingsSection({
  fileInputRef,
  missingMediaTotal,
  mediaIntegrity,
  autoBackup,
  restoringBackup,
  onToggleAutoBackup,
  onExport,
  onExportAutoBackup,
  onImportFileChange,
}: BackupSettingsSectionProps) {
  return (
    <div>
      <h2 className="ios-caption-upper app-muted mb-2">Sauvegarde</h2>
      <div className="rounded-2xl app-panel overflow-hidden">
        <div className="ios-settings-row">
          <p className="ios-body app-muted">
            Exportez vos donnees pour les sauvegarder ou les transferer. Les blobs locaux ne sont pas inclus, mais les URL cloud sont conservees.
          </p>
        </div>
        {missingMediaTotal > 0 && (
          <div className="px-4 pb-3">
            <div className="rounded-xl border border-[color:var(--app-warning)]/35 bg-[color:var(--app-warning)]/10 px-3 py-2">
              <p className="ios-caption text-[color:var(--app-warning)] font-semibold">Medias potentiellement perdus</p>
              <p className="ios-caption app-muted">
                {mediaIntegrity.missingProducts} produit(s) et {mediaIntegrity.missingInvoices} facture(s) n&apos;ont ni media local ni URL cloud.
              </p>
            </div>
          </div>
        )}
        <div className="ios-settings-separator" />
        <div className="ios-settings-row">
          <span className="text-[14px] app-text">Backup auto hebdomadaire</span>
          <button
            onClick={onToggleAutoBackup}
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
            onClick={onExport}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl app-success-bg text-[14px] font-semibold active:opacity-70 transition-opacity"
          >
            Exporter
          </button>
          <button
            onClick={onExportAutoBackup}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl app-surface-2 app-text text-[14px] font-semibold active:opacity-70 transition-opacity"
          >
            Export auto
          </button>
        </div>
        <div className="ios-settings-separator" />
        <div className="px-4 py-3">
          <input ref={fileInputRef} type="file" accept=".json" onChange={onImportFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={restoringBackup}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl app-warning-bg text-[14px] font-semibold active:opacity-70 transition-opacity"
          >
            {restoringBackup ? 'Restauration...' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
