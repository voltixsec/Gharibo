"use client";

import { cn } from "@/lib/utils";
import { Info, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";

interface TruthNoticeProps {
  variant: "info" | "warning" | "verified" | "alert";
  title: string;
  message?: string;
  className?: string;
}

const VARIANT_CONFIG = {
  info: {
    icon: Info,
    className:
      "border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-400",
  },
  warning: {
    icon: AlertTriangle,
    className:
      "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  verified: {
    icon: ShieldCheck,
    className:
      "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  },
  alert: {
    icon: ShieldAlert,
    className:
      "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400",
  },
} as const;

export function TruthNotice({ variant, title, message, className }: TruthNoticeProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm", config.className, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {message && <p className="mt-0.5 text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
