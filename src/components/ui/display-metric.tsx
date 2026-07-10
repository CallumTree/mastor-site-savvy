import * as React from "react";
import { cn } from "@/lib/utils";

interface DisplayMetricProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  value: React.ReactNode;
}

export function DisplayMetric({ label, value, className, ...props }: DisplayMetricProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      {label && <span className="label-mono">{label}</span>}
      <span className="hero-number text-4xl">{value}</span>
    </div>
  );
}
