import { cn } from '../../utils';

interface ApiSettingsSectionProps {
  inputClass: string;
  geminiConnected: boolean;
  geminiKey: string;
  onGeminiKeyChange: (value: string) => void;
  onSave: () => void;
}

export default function ApiSettingsSection({
  inputClass,
  geminiConnected,
  geminiKey,
  onGeminiKeyChange,
  onSave,
}: ApiSettingsSectionProps) {
  return (
    <div>
      <h2 className="ios-caption-upper app-muted mb-2">API Gemini</h2>
      <div className="rounded-2xl glass-card glass-panel overflow-hidden">
        <div className="ios-settings-row">
          <span className="text-[14px] app-text">Statut</span>
          <span className={cn('flex items-center gap-1.5 ios-body font-medium', geminiConnected ? 'text-[color:var(--app-success)]' : 'app-muted')}>
            <span className={cn('w-2 h-2 rounded-full', geminiConnected ? 'bg-[color:var(--app-success)]' : 'app-surface-3')} />
            {geminiConnected ? 'Connecte' : 'Non configure'}
          </span>
        </div>
        <div className="ios-settings-separator" />
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">Cle API</label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => onGeminiKeyChange(e.target.value)}
            placeholder="AIza..."
            className={inputClass}
          />
          <p className="ios-caption app-muted">Necessaire pour l'analyse des factures par IA</p>
        </div>
        <div className="px-4 py-3">
          <button
            onClick={onSave}
            className="w-full py-2.5 rounded-xl app-accent-bg text-[14px] font-semibold active:opacity-70 transition-opacity"
          >
            Enregistrer la cle
          </button>
        </div>
      </div>
    </div>
  );
}

