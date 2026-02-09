import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center app-panel">
      <div className="mb-5 app-muted">{icon}</div>
      <h3 className="ios-title3 app-text mb-2">
        {title}
      </h3>
      <p className="ios-body app-muted max-w-xs mb-8">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}

