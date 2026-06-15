import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Sharp-cornered primary, hairline gold border on hover
        default:
          "rounded-none bg-primary text-primary-foreground shadow-sm border border-transparent hover:border-gold hover:bg-primary",
        destructive:
          "rounded-none bg-destructive text-destructive-foreground shadow-sm border border-transparent hover:border-gold",
        // Pill-shaped ghost secondary
        outline:
          "rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "rounded-full hover:bg-accent hover:text-accent-foreground",
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
