import { cn } from "@/lib/utils";

/**
 * A keyboard bypass link (WCAG 2.4.1).
 *
 * Visually hidden until it receives focus, then rendered as a prominent button.
 * Used because the dashboard navigation rail is ~12 tab stops and the Playground
 * conversation list adds dozens more, so a keyboard user needs a way past them.
 */
export function SkipLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "sr-only",
        "focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]",
        "focus:rounded-md focus:bg-[color:var(--gharibo-cyan)] focus:px-4 focus:py-2",
        "focus:text-sm focus:font-medium focus:text-[color:var(--gharibo-bg)]",
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--gharibo-cyan-bright)]",
        className,
      )}
    >
      {children}
    </a>
  );
}
