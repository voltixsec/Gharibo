import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RuntimeStatusProvider } from "@/components/providers/runtime-status-provider";
import { SkipLink } from "@/components/skip-link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      {/*
        One runtime probe for the whole dashboard. Without this, each consumer
        (status badge, model selector, inspector, page) would fire its own live
        probe, and each probe can wake a scaled-to-zero GPU container.
      */}
      <RuntimeStatusProvider>
        {/*
          Bypass block (WCAG 2.4.1). The navigation rail is ~12 tab stops, so a
          keyboard user needs a way past it. Visible only when focused.
        */}
        <SkipLink href="#main-content">Skip to main content</SkipLink>

        {/*
          Column on small screens (app bar above content), row at `lg` and above
          (fixed navigation column beside content).
        */}
        <div className="flex h-screen flex-col overflow-hidden lg:flex-row">
          {/* App bar + navigation drawer below `lg`. Contributes nothing at `lg`. */}
          <MobileNav />

          {/* Fixed navigation column at `lg` and above. */}
          <Sidebar className="hidden lg:flex" />

          {/*
            Content pages scroll here. The Playground fills this box exactly
            (`h-full`) and owns its own internal scroll areas, so there is no
            double scrollbar.
          */}
          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto bg-background focus:outline-none"
          >
            {children}
          </main>
        </div>
      </RuntimeStatusProvider>
    </TooltipProvider>
  );
}
