import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { analytics } from '../../services/analytics';

const STEPS = [
  {
    title: 'Bienvenue sur CuisineControl',
    description: 'Votre assistant HACCP personnel pour gerer votre cuisine professionnelle en toute simplicite.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--app-accent)]">
        <rect x="4" y="4" width="16" height="11" rx="3" />
        <path d="M12 15v3M9 20h6M9 9h.01M15 9h.01" />
      </svg>
    ),
    features: [
      'Suivi des temperatures HACCP',
      'Tracabilite des produits par scanner',
      'Gestion des recettes avec couts',
      'Commandes fournisseurs',
    ],
  },
  {
    title: 'Configurez vos equipements',
    description: 'Commencez par ajouter vos equipements frigorifiques pour suivre les temperatures.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--app-accent)]">
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    ),
    action: { label: 'Ajouter un equipement', path: '/temperature' },
  },
  {
    title: 'Pret a demarrer !',
    description: 'Explorez les fonctionnalites ou commencez par une saisie de temperature.',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--app-success)]">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
    quickActions: [
      { label: 'Saisir une temperature', path: '/temperature?quick=input' },
      { label: 'Scanner un produit', path: '/traceability?tab=scanner&quick=scan' },
      { label: 'Creer une recette', path: '/recipes' },
    ],
  },
] as const;

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const current = STEPS[step];

  const handleComplete = async () => {
    await updateSettings({ onboardingDone: true });
    analytics.onboardingCompleted();
    navigate('/dashboard');
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      void handleComplete();
    }
  };

  const handleSkip = () => {
    void handleComplete();
  };

  return (
    <div className="fixed inset-0 z-50 app-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 animate-fade-in-up">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 app-accent-bg' : i < step ? 'bg-[color:var(--app-success)]' : 'app-surface-3'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-2xl app-surface-2 flex items-center justify-center">
            {current.icon}
          </div>
          <h2 className="ios-headline app-text">{current.title}</h2>
          <p className="ios-body app-muted">{current.description}</p>
        </div>

        {/* Step-specific content */}
        {step === 0 && 'features' in current && (
          <div className="glass-card glass-panel space-y-2">
            {current.features.map((feature) => (
              <div key={feature} className="flex items-center gap-3 p-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--app-success)] shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                </svg>
                <span className="ios-body app-text">{feature}</span>
              </div>
            ))}
          </div>
        )}

        {step === 2 && 'quickActions' in current && (
          <div className="space-y-2">
            {current.quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => {
                  void handleComplete().then(() => navigate(action.path));
                }}
                className="w-full p-3.5 rounded-xl glass-card glass-panel text-left ios-body font-medium app-text flex items-center justify-between active:opacity-70 transition-opacity"
              >
                {action.label}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="app-muted">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleNext}
            className="w-full py-3.5 rounded-xl app-accent-bg ios-body font-semibold active:opacity-70 transition-opacity"
          >
            {step === STEPS.length - 1 ? 'Commencer' : 'Suivant'}
          </button>
          {step < STEPS.length - 1 && (
            <button
              onClick={handleSkip}
              className="w-full py-2 ios-caption app-muted font-medium active:opacity-70"
            >
              Passer l'introduction
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

