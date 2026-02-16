import type { StorageEstimate } from '../../services/db';
import { cn } from '../../utils';

interface StorageSettingsSectionProps {
  storageEstimate: StorageEstimate | null;
  usagePercent: number;
  formatStorageBytes: (bytes: number) => string;
}

export default function StorageSettingsSection({
  storageEstimate,
  usagePercent,
  formatStorageBytes,
}: StorageSettingsSectionProps) {
  return (
    <div>
      <h2 className="ios-caption-upper app-muted mb-2">Stockage local</h2>
      <div className="rounded-2xl glass-card glass-panel overflow-hidden">
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
  );
}

