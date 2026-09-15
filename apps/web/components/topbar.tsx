"use client";

import { Menu, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";
import { StatusBadge, type StatusVariant } from "@/components/status";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Command Dashboard",
  "/playground": "Playground",
  "/research-gym": "Research Gym",
  "/data-factory": "Data Factory",
  "/datasets": "Datasets",
  "/training": "Training",
  "/evaluations": "Evaluations",
  "/models": "Models",
  "/experiments": "Experiments",
  "/system": "System",
  "/settings": "Settings",
};

function resolveTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith("/training/")) return "Training Run";
  return "GHARIBO AI LAB";
}

interface TopbarProps {
  onMobileMenu: () => void;
  projectState?: {
    label: string;
    variant: StatusVariant;
  };
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * The persistent top bar: current route, current project/training truth, and
 * the appearance toggle. It deliberately holds no page-specific actions —
 * those belong to each page's own PageHeader.
 */
export function Topbar({
  onMobileMenu,
  projectState,
  collapsed,
  onToggleCollapse,
}: TopbarProps) {
  const pathname = usePathname();
  const title = resolveTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMobileMenu}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {projectState && (
          <StatusBadge
            variant={projectState.variant}
            label={projectState.label}
            className="max-w-[10rem] sm:max-w-none"
          />
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
