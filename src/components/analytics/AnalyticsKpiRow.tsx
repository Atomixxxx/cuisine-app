export interface AnalyticsKpiItem {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export default function AnalyticsKpiRow({ items }: { items: AnalyticsKpiItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {items.map((item) => (
        <div key={item.label} className="glass-card glass-kpi">
          <p className="ios-caption app-muted">{item.label}</p>
          <p className="text-[21px] sm:text-[23px] leading-none font-bold mt-1" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </p>
          {item.sub && <p className="ios-small app-muted mt-1">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}
