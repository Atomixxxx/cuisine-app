import { cn } from '../../utils';

interface CloudSettingsSectionProps {
  inputClass: string;
  supabaseAuthConfigured: boolean;
  supabaseUserEmail: string | null;
  supabaseEmail: string;
  supabasePassword: string;
  supabaseSigningIn: boolean;
  supabaseSigningOut: boolean;
  onSupabaseEmailChange: (value: string) => void;
  onSupabasePasswordChange: (value: string) => void;
  onLogin: () => void;
  onLogout: () => void;
}

export default function CloudSettingsSection({
  inputClass,
  supabaseAuthConfigured,
  supabaseUserEmail,
  supabaseEmail,
  supabasePassword,
  supabaseSigningIn,
  supabaseSigningOut,
  onSupabaseEmailChange,
  onSupabasePasswordChange,
  onLogin,
  onLogout,
}: CloudSettingsSectionProps) {
  return (
    <div>
      <h2 className="ios-caption-upper app-muted mb-2">Cloud Supabase</h2>
      <div className="rounded-2xl app-panel overflow-hidden">
        <div className="ios-settings-row">
          <span className="text-[14px] app-text">Configuration</span>
          <span className={cn('ios-body font-medium', supabaseAuthConfigured ? 'text-[color:var(--app-success)]' : 'app-muted')}>
            {supabaseAuthConfigured ? 'Variables OK' : 'Variables manquantes'}
          </span>
        </div>
        <div className="ios-settings-separator" />
        <div className="ios-settings-row">
          <span className="text-[14px] app-text">Session</span>
          <span className={cn('ios-body font-medium', supabaseUserEmail ? 'text-[color:var(--app-success)]' : 'app-muted')}>
            {supabaseUserEmail ?? 'Non connecte'}
          </span>
        </div>
        <div className="ios-settings-separator" />
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">Email Supabase</label>
          <input
            type="email"
            value={supabaseEmail}
            onChange={(e) => onSupabaseEmailChange(e.target.value)}
            placeholder="utilisateur@domaine.com"
            className={inputClass}
          />
        </div>
        <div className="ios-settings-separator" />
        <div className="ios-settings-row flex-col items-stretch gap-1.5">
          <label className="text-[14px] app-text">Mot de passe Supabase</label>
          <input
            type="password"
            value={supabasePassword}
            onChange={(e) => onSupabasePasswordChange(e.target.value)}
            placeholder="********"
            className={inputClass}
          />
        </div>
        <div className="px-4 py-3 flex gap-3">
          <button
            onClick={onLogin}
            disabled={!supabaseAuthConfigured || supabaseSigningIn}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70 transition-opacity',
              !supabaseAuthConfigured || supabaseSigningIn ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
            )}
          >
            {supabaseSigningIn ? 'Connexion...' : 'Se connecter'}
          </button>
          <button
            onClick={onLogout}
            disabled={!supabaseUserEmail || supabaseSigningOut}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70 transition-opacity',
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
  );
}
