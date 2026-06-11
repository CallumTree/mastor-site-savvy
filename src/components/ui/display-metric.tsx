import * as React from "react";
import { cn } from "@/lib/utils";

interface DisplayMetricProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  value: React.ReactNode;
}

export function DisplayMetric({ label, value, className, ...props }: DisplayMetricProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      {label && (
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      )}
      <span
        className="font-display text-primary leading-none"
        style={{ fontSize: "2.5rem" }}
      >
        {value}
      </span>
    </div>
  );
}
