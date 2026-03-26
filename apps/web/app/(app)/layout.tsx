import { AppEntryNotice } from "@/components/AppEntryNotice";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AppEntryNotice />
      {children}
    </AppShell>
  );
}
