import { cn } from '../../utils';

interface GeneralSettingsSectionProps {
  inputClass: string;
  establishmentName: string;
  priceThreshold: string;
  saving: boolean;
  onEstablishmentNameChange: (value: string) => void;
  onPriceThresholdChange: (value: string) => void;
  onSave: () => void;
}

export default function GeneralSettingsSection({
  inputClass,
  establishmentName,
  priceThreshold,
  saving,
  onEstablishmentNameChange,
  onPriceThresholdChange,
  onSave,
}: GeneralSettingsSectionProps) {
  return (
    <div>
      <h2 className="ios-caption-upper app-muted mb-2">General</h2>
      <div className="rounded-2xl app-panel overflow-hidden">
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">Nom de l'etablissement</label>
          <input
            type="text"
            value={establishmentName}
            onChange={(e) => onEstablishmentNameChange(e.target.value)}
            placeholder="Mon Restaurant"
            className={inputClass}
          />
        </div>
        <div className="ios-settings-separator" />
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">Seuil alerte prix (%)</label>
          <input
            type="number"
            min="1"
            max="100"
            value={priceThreshold}
            onChange={(e) => onPriceThresholdChange(e.target.value)}
            className={inputClass}
          />
          <p className="ios-caption app-muted">Alerte si la variation de prix depasse ce pourcentage</p>
        </div>
        <div className="px-4 py-3">
          <button
            onClick={onSave}
            disabled={saving}
            className={cn(
              'w-full py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70',
              saving ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
            )}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
