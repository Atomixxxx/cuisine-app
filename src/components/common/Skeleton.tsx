import type { ReactElement } from 'react';
import { cn } from '../../utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl app-surface-3',
        className
      )}
    />
  );
}

export function InvoiceCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl app-card">
      <Skeleton className="w-14 h-18 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-1">
          <Skeleton className="h-4 w-12 rounded-full" />
          <Skeleton className="h-4 w-10 rounded-full" />
        </div>
      </div>
      <div className="text-right space-y-1">
        <Skeleton className="h-5 w-16 ml-auto" />
        <Skeleton className="h-3 w-8 ml-auto" />
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl app-card overflow-hidden">
      <Skeleton className="w-full h-32 rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function TaskItemSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl app-card">
      <Skeleton className="w-6 h-6 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-5 w-14 rounded-full shrink-0" />
    </div>
  );
}

export function ListSkeleton({ count = 4, Card }: { count?: number; Card: () => ReactElement }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
}
