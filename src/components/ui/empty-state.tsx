import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border border-border border-l-[2px] border-l-primary bg-card shadow-sm p-10 text-center flex flex-col items-center gap-4",
        className,
      )}
    >
      <Icon size={48} className="text-gold" strokeWidth={1.25} />
      <h3 className="font-display text-2xl text-primary">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action ?? (actionLabel && (
        <Button onClick={onAction} className="mt-2">{actionLabel}</Button>
      ))}
    </div>
  );
}
