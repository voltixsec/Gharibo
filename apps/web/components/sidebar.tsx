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
  Settings2,
  Settings,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Branding */}
      <div className="flex flex-col gap-1 border-b px-5 py-5">
        <h1 className="text-lg font-bold tracking-tight">
          GHARIBO AI LAB
        </h1>
        <p className="text-xs text-muted-foreground">
          Build. Train. Evaluate. Evolve.
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive =
            pathname === section.href || pathname.startsWith(section.href + "/");

          return (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <span className="text-xs text-muted-foreground">v0.1.0</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
