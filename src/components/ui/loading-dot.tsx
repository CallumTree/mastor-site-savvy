import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingDotProps {
  label?: string;
  className?: string;
}

export function LoadingDot({ label, className }: LoadingDotProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
      {label && <span className="label-mono">{label}</span>}
    </div>
  );
}
