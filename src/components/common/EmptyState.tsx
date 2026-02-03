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
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="mb-5 text-[#86868b]">{icon}</div>
      <h3 className="ios-title3 text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
        {title}
      </h3>
      <p className="text-[15px] text-[#86868b] max-w-xs mb-8">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
