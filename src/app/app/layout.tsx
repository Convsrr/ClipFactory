import { AppShell } from "@/components/app-shell";
import { loadDashboard } from "@/server/app-data";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const dashboard = await loadDashboard();
  return (
    <AppShell previewMode={dashboard.mode === "preview"} user={dashboard.user}>
      {children}
    </AppShell>
  );
}
