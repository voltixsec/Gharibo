/**
 * GHARIBO brand marks.
 *
 * The orbital sphere is the OFFICIAL supplied asset (`/brand/gharibo-ai-mark.jpg`,
 * cropped from the original logo). It is never redrawn, recoloured or replaced
 * with a lookalike icon.
 *
 * The wordmark is rendered as TEXT rather than as a bitmap crop: the supplied
 * logo has a baked-in dark background, which would render as a dark rectangle on
 * a light surface. Setting the wordmark in the brand's type treatment keeps it
 * crisp, themeable and legible in both light and dark mode, while the mark
 * itself remains the authentic artwork.
 */
import Image from "next/image";
import { cn } from "@/lib/utils";

interface GhariboMarkProps {
  /** Rendered size in pixels. */
  size?: number;
  className?: string;
  /** Adds the single sanctioned brand glow. Use sparingly. */
  glow?: boolean;
  priority?: boolean;
}

export function GhariboMark({
  size = 32,
  className,
  glow = false,
  priority = false,
}: GhariboMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%]",
        "ring-1 ring-inset ring-white/10",
        glow && "gharibo-glow",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/gharibo-ai-mark.jpg"
        alt="GHARIBO AI"
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

interface GhariboLogoProps {
  /** Size of the mark. */
  size?: number;
  className?: string;
  /** Show the "AI LAB" context line. */
  showLab?: boolean;
  glow?: boolean;
}

export function GhariboLogo({
  size = 34,
  className,
  showLab = true,
  glow = false,
}: GhariboLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <GhariboMark size={size} glow={glow} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="flex items-baseline gap-1 truncate">
          <span className="text-[0.9375rem] font-semibold tracking-[0.14em] text-foreground">
            GHARIBO
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-[0.14em] text-[color:var(--gharibo-cyan)]">
            AI
          </span>
        </span>
        {showLab && (
          <span className="mt-1 text-[0.5625rem] font-medium uppercase tracking-[0.28em] text-[color:var(--gharibo-text-subtle)]">
            AI Lab
          </span>
        )}
      </span>
    </span>
  );
}

interface GhariboOrbitProps {
  /** Diameter of the mark at the centre. */
  size?: number;
  className?: string;
  label?: string;
}

/**
 * GHARIBO-native generation indicator.
 *
 * A small orbital ring travelling around the mark — the graphical language of
 * the logo itself, rather than a generic spinner. Honours
 * `prefers-reduced-motion` (the animation is disabled in CSS, and a static ring
 * remains so the state is still legible).
 */
export function GhariboOrbit({ size = 26, className, label }: GhariboOrbitProps) {
  const ringSize = size + 14;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="relative inline-flex items-center justify-center"
        style={{ width: ringSize, height: ringSize }}
        aria-hidden="true"
      >
        {/* Static track */}
        <span className="absolute inset-0 rounded-full border border-[color:var(--gharibo-border-strong)]" />
        {/* Travelling orbital arc */}
        <span
          className="gharibo-animate-orbit absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, transparent 240deg, var(--gharibo-cyan) 330deg, var(--gharibo-cyan-bright) 360deg)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))",
          }}
        />
        <span className="gharibo-animate-breathe absolute inset-0 rounded-full bg-[color:var(--gharibo-glow)] blur-md" />
        <GhariboMark size={size} className="relative" />
      </span>
      {label && (
        <span className="text-sm text-muted-foreground" role="status">
          {label}
        </span>
      )}
    </span>
  );
}
