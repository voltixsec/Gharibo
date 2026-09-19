"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

/**
 * Slider with an accessible name on the THUMB.
 *
 * Radix puts `role="slider"` on the Thumb, not on Root, so spreading
 * `aria-label` onto Root (as the stock shadcn implementation does) leaves the
 * control announced as an unlabelled slider. The label is therefore forwarded to
 * each thumb explicitly, while still being spread onto Root for completeness.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const ariaLabel = props["aria-label"];
  const ariaLabelledBy = props["aria-labelledby"];

  const values = props.value ?? props.defaultValue;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {values
        ? (Array.isArray(values) ? values : [values]).map((_, i) => (
            <SliderPrimitive.Thumb
              key={i}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            />
          ))
        : null}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
