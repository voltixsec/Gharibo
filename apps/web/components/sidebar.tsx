"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FlaskConical,
  Search,
  Database,
  FolderGit2,
  Cpu,
  BarChart3,
  Boxes,
  GitBranch,
  Settings,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { GhariboLogo } from "@/components/brand/gharibo-brand";

const NAV_SECTIONS = [
  { label: "Playground", href: "/playground", icon: FlaskConical },
  { label: "Research Gym", href: "/research-gym", icon: Search },
  { label: "Data Factory", href: "/data-factory", icon: Database },
  { label: "Datasets", href: "/datasets", icon: FolderGit2 },
  { label: "Training", href: "/training", icon: Cpu },
  { label: "Evaluations", href: "/evaluations", icon: BarChart3 },
  { label: "Models", href: "/models", icon: Boxes },
  { label: "Experiments", href: "/experiments", icon: GitBranch },
  { label: "System", href: "/system", icon: Terminal },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

interface SidebarProps {
  className?: string;
  /** Called after a navigation link is activated (used to close the mobile drawer). */
  onNavigate?: () => void;
  /** Renders a close control in the header (mobile drawer). */
  onClose?: () => void;
}

/**
 * Application navigation.
 *
 * Rendered as a fixed column at `lg` and above, and inside a drawer below it.
 * The sidebar itself does not decide its placement — the layout does — so the
 * same markup serves both without duplication.
 */
export function Sidebar({ className, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-border bg-[color:var(--gharibo-surface-sunken)]",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center justify-between border-b border-border px-5 py-5">
        <Link
          href="/playground"
          onClick={onNavigate}
          className="flex items-center"
          aria-label="GHARIBO AI Lab home"
        >
          <GhariboLogo size={32} glow />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span aria-hidden="true" className="block text-lg leading-none">
              ×
            </span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive =
            pathname === section.href || pathname.startsWith(section.href + "/");

          return (
            <Link
              key={section.href}
              href={section.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] font-medium transition-colors",
                isActive
                  ? "bg-[color:var(--gharibo-cyan)]/12 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {isActive && (
                <span className="gharibo-edge absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full" />
              )}
              <Icon
                className={cn("h-4 w-4 shrink-0", isActive && "text-[color:var(--gharibo-cyan)]")}
              />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">v0.1.0</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
