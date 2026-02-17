import { lazy, Suspense, useMemo, useState } from 'react';
import { cn } from '../../utils';

const FinancialSection = lazy(() => import('../../components/analytics/FinancialSection'));
const RecipeCostSection = lazy(() => import('../../components/analytics/RecipeCostSection'));
const TemperatureComplianceSection = lazy(() => import('../../components/analytics/TemperatureComplianceSection'));

type AnalyticsTab = 'financial' | 'recipes' | 'temperature';

const TABS: { key: AnalyticsTab; label: string }[] = [
  { key: 'financial', label: 'Finances' },
  { key: 'recipes', label: 'Recettes' },
  { key: 'temperature', label: 'Temperatures' },
];

function LoadingState() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-3 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('financial');

  const activeContent = useMemo(() => {
    if (activeTab === 'recipes') return <RecipeCostSection />;
    if (activeTab === 'temperature') return <TemperatureComplianceSection />;
    return <FinancialSection />;
  }, [activeTab]);

  return (
    <div className="app-page-wrap pb-24 space-y-3">
      <section className="glass-card glass-hero space-y-3 animate-fade-in-up">
        <div>
          <h1 className="ios-title app-text">Analytics</h1>
          <p className="ios-caption app-muted">Pilotage finances, food cost et compliance HACCP.</p>
        </div>
        <div className="ios-segmented max-w-xl">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn('ios-segmented-item', activeTab === tab.key && 'active')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <Suspense fallback={<LoadingState />}>
        {activeContent}
      </Suspense>
    </div>
  );
}
