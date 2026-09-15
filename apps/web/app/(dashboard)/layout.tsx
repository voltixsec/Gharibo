import { AppShell } from "@/components/app-shell";
import { getProjectStateForTopbar } from "@/lib/dashboard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const projectState = getProjectStateForTopbar();

  return (
    <AppShell projectState={projectState}>
      {children}
    </AppShell>
  );
}
