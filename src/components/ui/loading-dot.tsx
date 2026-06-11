import { cn } from "@/lib/utils";

interface LoadingDotProps {
  label?: string;
  className?: string;
}

export function LoadingDot({ label, className }: LoadingDotProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      {label && (
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      )}
    </div>
  );
}
