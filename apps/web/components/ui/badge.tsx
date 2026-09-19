import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        /*
         * 700-weight greens/ambers, not 500/600.
         *
         * Badges render at `text-xs` (12px), which is "small text" for WCAG, so
         * white-on-background must reach 4.5:1. `green-600` measures 3.3:1 and
         * `amber-500` about 2.2:1 — both below the threshold. The 700 shades
         * measure ~5.0:1. Found by the cross-page accessibility check.
         */
        success: "border-transparent bg-green-700 text-white hover:bg-green-700/85",
        warning: "border-transparent bg-amber-700 text-white hover:bg-amber-700/85",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
