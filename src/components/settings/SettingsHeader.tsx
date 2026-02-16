interface SettingsHeaderProps {
  establishmentName: string;
  geminiConnected: boolean;
  autoBackup: boolean;
  pinEnabled: boolean;
  supabaseAuthConfigured: boolean;
  supabaseUserEmail: string | null;
}

export default function SettingsHeader({
  establishmentName,
  geminiConnected,
  autoBackup,
  pinEnabled,
  supabaseAuthConfigured,
  supabaseUserEmail,
}: SettingsHeaderProps) {
  return (
    <div className="glass-card glass-hero space-y-3 spx-scan-line animate-fade-in-up">
      <div>
        <h1 className="ios-title app-text">Parametres</h1>
        <p className="text-[11px] sm:text-[12px] app-muted">Configuration generale, API, sauvegardes et securite.</p>
      </div>
      <div className="app-kpi-grid">
        <div className="glass-card glass-kpi">
          <p className="app-kpi-label">Etablissement</p>
          <p className="app-kpi-value text-[14px] font-semibold truncate">{establishmentName || 'Non renseigne'}</p>
        </div>
        <div className="glass-card glass-kpi">
          <p className="app-kpi-label">Gemini API</p>
          <p className="app-kpi-value text-[14px] font-semibold">{geminiConnected ? 'Connecte' : 'Inactif'}</p>
        </div>
        <div className="glass-card glass-kpi">
          <p className="app-kpi-label">Backup auto</p>
          <p className="app-kpi-value text-[14px] font-semibold">{autoBackup ? 'Actif' : 'Off'}</p>
        </div>
        <div className="glass-card glass-kpi">
          <p className="app-kpi-label">Code PIN</p>
          <p className="app-kpi-value text-[14px] font-semibold">{pinEnabled ? 'Actif' : 'Off'}</p>
        </div>
        <div className="glass-card glass-kpi">
          <p className="app-kpi-label">Cloud</p>
          <p className="app-kpi-value text-[14px] font-semibold">
            {supabaseAuthConfigured ? (supabaseUserEmail ? 'Connecte' : 'Pret') : 'Non configure'}
          </p>
        </div>
      </div>
    </div>
  );
}

