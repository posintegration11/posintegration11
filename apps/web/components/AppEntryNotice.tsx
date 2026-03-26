"use client";

import { useEffect, useState } from "react";

export const POS_SHOW_ENTRY_NOTICE_KEY = "pos-show-entry-notice";

const AUTO_HIDE_MS = 7000;

/** After staff/restaurant login (not platform). Set flag in sessionStorage on login success. */
export function AppEntryNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(POS_SHOW_ENTRY_NOTICE_KEY) !== "1") return;
      sessionStorage.removeItem(POS_SHOW_ENTRY_NOTICE_KEY);
      setVisible(true);
      const t = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
      return () => window.clearTimeout(t);
    } catch {
      /* private mode */
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[200] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text)]">Signed in</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            You are in the restaurant POS. Sign out when finished on shared devices.
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
