import { cn } from '../../utils';

interface SecuritySettingsSectionProps {
  inputClass: string;
  pinEnabled: boolean;
  currentPin: string;
  newPin: string;
  confirmPin: string;
  onCurrentPinChange: (value: string) => void;
  onNewPinChange: (value: string) => void;
  onConfirmPinChange: (value: string) => void;
  onEnablePin: () => void;
  onDisablePin: () => void;
  onChangePin: () => void;
}

export default function SecuritySettingsSection({
  inputClass,
  pinEnabled,
  currentPin,
  newPin,
  confirmPin,
  onCurrentPinChange,
  onNewPinChange,
  onConfirmPinChange,
  onEnablePin,
  onDisablePin,
  onChangePin,
}: SecuritySettingsSectionProps) {
  return (
    <div>
      <h2 className="ios-caption-upper app-muted mb-2">Securite</h2>
      <div className="rounded-2xl app-panel overflow-hidden">
        <div className="ios-settings-row">
          <span className="text-[14px] app-text">Code PIN</span>
          <span className={cn('ios-body font-medium', pinEnabled ? 'text-[color:var(--app-success)]' : 'app-muted')}>
            {pinEnabled ? 'Active' : 'Desactive'}
          </span>
        </div>
        <div className="ios-settings-separator" />
        {pinEnabled && (
          <>
            <div className="ios-settings-row flex-col items-stretch gap-1.5">
              <label className="text-[14px] app-text">PIN actuel</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={currentPin}
                onChange={(e) => onCurrentPinChange(e.target.value)}
                placeholder="0000"
                className={inputClass}
              />
            </div>
            <div className="ios-settings-separator" />
          </>
        )}
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">{pinEnabled ? 'Nouveau PIN' : 'PIN'}</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => onNewPinChange(e.target.value)}
            placeholder="0000"
            className={inputClass}
          />
        </div>
        <div className="ios-settings-separator" />
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">Confirmation PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(e) => onConfirmPinChange(e.target.value)}
            placeholder="0000"
            className={inputClass}
          />
        </div>
        <div className="px-4 py-3 flex gap-3">
          {pinEnabled ? (
            <>
              <button
                onClick={onChangePin}
                className="flex-1 py-2.5 rounded-xl app-accent-bg text-[14px] font-semibold active:opacity-70 transition-opacity"
              >
                Changer PIN
              </button>
              <button
                onClick={onDisablePin}
                className="flex-1 py-2.5 rounded-xl app-danger-bg text-[14px] font-semibold active:opacity-70 transition-opacity"
              >
                Desactiver
              </button>
            </>
          ) : (
            <button
              onClick={onEnablePin}
              className="w-full py-2.5 rounded-xl app-accent-bg text-[14px] font-semibold active:opacity-70 transition-opacity"
            >
              Activer le PIN
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
