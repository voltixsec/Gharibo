"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

interface AppShellProps {
  children: React.ReactNode;
  /** Compact, truthful project status rendered in the topbar. */
  projectState?: {
    label: string;
    variant: import("@/components/status").StatusVariant;
  };
}

/**
 * The single application shell.
 *
 * Every dashboard route renders inside this shell so that navigation, spacing,
 * scroll behaviour and the topbar are identical everywhere. The shell owns two
 * pieces of layout state:
 *   - `mobileOpen` — the off-canvas drawer, which never occupies layout space
 *     and is therefore safe at tablet and mobile widths.
 *   - `collapsed`  — the desktop rail, which collapses to icons so a dense
 *     control centre does not waste horizontal space on wide monitors.
 */
export function AppShell({ children, projectState }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleMobileMenu = useCallback(() => setMobileOpen(true), []);
  const handleMobileClose = useCallback(() => setMobileOpen(false), []);
  const handleToggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a
        href="#gharibo-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
        collapsed={collapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          onMobileMenu={handleMobileMenu}
          projectState={projectState}
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <main
          id="gharibo-main"
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
