import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";
import { loadDashboard } from "@/server/app-data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
