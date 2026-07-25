import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Full pill, solid fill — the system "default button" pattern
        default:
          "rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:opacity-80",
        destructive:
          "rounded-full bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 active:opacity-80",
        outline:
          "rounded-full border border-input bg-card hover:bg-secondary",
        secondary:
          "rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost:
          "rounded-full hover:bg-secondary",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 h-11 px-5 py-2",
        sm: "min-h-11 h-11 px-4 text-xs sm:min-h-8 sm:h-8",
        lg: "min-h-12 h-12 px-8",
        icon: "h-11 w-11 min-h-11 min-w-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
