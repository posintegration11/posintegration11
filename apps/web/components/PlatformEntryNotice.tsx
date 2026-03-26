"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const AUTO_HIDE_MS = 7000;

/** Shown each time the platform admin area is entered (in-app banner, not system notifications). */
export function PlatformEntryNotice() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pathname.startsWith("/platform")) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="safe-pt pointer-events-none fixed left-0 right-0 top-0 z-[200] flex justify-center px-3 pt-3"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text)]">Platform admin</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Super admin panel is active. Sign out when finished on shared devices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
          aria-label="Dismiss notification"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
