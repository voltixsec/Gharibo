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
  LayoutDashboard,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navigation groups. Grouping is deliberate: it separates the day-to-day
 * research loop from the governed infrastructure and from configuration, which
 * keeps an 11-item list scannable in a narrow desktop rail.
 */
const NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
  }>;
}> = [
  {
    label: "Operate",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Playground", href: "/playground", icon: FlaskConical },
      { label: "Research Gym", href: "/research-gym", icon: Search },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Data Factory", href: "/data-factory", icon: Database },
      { label: "Datasets", href: "/datasets", icon: FolderGit2 },
    ],
  },
  {
    label: "Model",
    items: [
      { label: "Training", href: "/training", icon: Cpu },
      { label: "Evaluations", href: "/evaluations", icon: BarChart3 },
      { label: "Models", href: "/models", icon: Boxes },
      { label: "Experiments", href: "/experiments", icon: GitBranch },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "System", href: "/system", icon: Terminal },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Desktop rail drawer state, controlled by the shell. */
  collapsed: boolean;
}

export function Sidebar({ mobileOpen, onMobileClose, collapsed }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Mobile scrim */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Mobile: an off-canvas drawer that never occupies layout space.
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col border-r bg-card transition-[transform,width] duration-200",
          // Desktop: a real static rail that can collapse to icons.
          "lg:static lg:z-auto lg:h-screen lg:translate-x-0",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Branding */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b px-3",
            collapsed ? "lg:justify-center" : "justify-between",
          )}
        >
          <Link
            href="/"
            onClick={onMobileClose}
            className="flex min-w-0 flex-col gap-0.5"
            title="GHARIBO AI LAB"
          >
            <span
              className={cn(
                "truncate text-sm font-bold tracking-tight",
                collapsed && "lg:hidden",
              )}
            >
              GHARIBO AI LAB
            </span>
            <span
              className={cn(
                "truncate text-[11px] text-muted-foreground",
                collapsed && "lg:hidden",
              )}
            >
              Build. Train. Evaluate. Evolve.
            </span>
            {/* Collapsed brand mark */}
            <span
              className={cn(
                "hidden text-sm font-bold tracking-tight",
                collapsed && "lg:inline",
              )}
            >
              GH
            </span>
          </Link>
          <button
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent lg:hidden"
            onClick={onMobileClose}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p
                className={cn(
                  "mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70",
                  collapsed && "lg:hidden",
                )}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onMobileClose}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                        collapsed && "lg:justify-center lg:px-0",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className={cn("truncate", collapsed && "lg:hidden")}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div
          className={cn(
            "shrink-0 border-t px-3 py-3",
            collapsed && "lg:flex lg:justify-center",
          )}
        >
          <span
            className={cn(
              "text-[11px] text-muted-foreground",
              collapsed && "lg:hidden",
            )}
          >
            v0.1.0 · internal
          </span>
          <span
            className={cn(
              "hidden font-mono text-[11px] text-muted-foreground",
              collapsed && "lg:inline",
            )}
          >
            v0.1
          </span>
        </div>
      </aside>
    </>
  );
}
