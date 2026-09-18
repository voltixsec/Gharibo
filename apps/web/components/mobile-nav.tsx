"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Menu } from "lucide-react";

/**
 * Mobile navigation shell.
 *
 * Below `lg` the fixed 240px navigation column would consume most of a phone
 * viewport (it left the conversation column ~150px wide at 390px), so it becomes
 * a drawer instead. The drawer is closed on first paint and only opens on an
 * explicit tap.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* App bar — only rendered where the fixed sidebar is hidden. */}
      <div className="flex items-center gap-2 border-b border-border bg-[color:var(--gharibo-surface-sunken)] px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium tracking-wide text-foreground">
          GHARIBO <span className="text-[color:var(--gharibo-cyan)]">AI</span>
        </span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-60 max-w-[80vw]">
            <Sidebar onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
