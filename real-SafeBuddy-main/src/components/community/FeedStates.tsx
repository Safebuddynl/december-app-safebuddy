import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the same shape as a report card, while reports load. */
export const ReportCardSkeleton = () => (
  <div className="rounded-2xl bg-card p-4 shadow-card" aria-hidden="true">
    <div className="flex gap-3">
      <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="mt-1 h-8 w-16 rounded-full" />
      </div>
    </div>
  </div>
);

export interface FeedEmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const FeedEmptyState = ({ Icon, title, description, action }: FeedEmptyStateProps) => (
  <div className="rounded-2xl bg-card px-6 py-10 text-center shadow-card">
    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-tint text-primary">
      <Icon className="h-7 w-7" aria-hidden="true" />
    </div>
    <p className="font-semibold">{title}</p>
    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);
