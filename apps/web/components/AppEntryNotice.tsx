"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const POS_SHOW_ENTRY_NOTICE_KEY = "pos-show-entry-notice";

const AUTO_HIDE_MS = 7000;

function AppEntryNoticeInner({ authReady }: { authReady: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!authReady) return;
    let show = false;
    try {
      const q = searchParams.get("signedIn") === "1";
      const ss = sessionStorage.getItem(POS_SHOW_ENTRY_NOTICE_KEY) === "1";
      if (q || ss) {
        show = true;
        sessionStorage.removeItem(POS_SHOW_ENTRY_NOTICE_KEY);
        if (q) {
          router.replace(pathname, { scroll: false });
        }
      }
    } catch {
      /* private mode */
    }
    if (show) setVisible(true);
  }, [authReady, searchParams, pathname, router]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!mounted || !visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[110] max-md:bottom-[calc(4.35rem+env(safe-area-inset-bottom,0px))] max-md:top-auto md:bottom-auto md:top-[max(0.75rem,env(safe-area-inset-top,0px))] flex justify-center px-3 md:px-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-xl shadow-black/30 ring-1 ring-white/5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text)]">Signed in</p>
          <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
            Restaurant POS is ready. Sign out when finished on shared devices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
          aria-label="Dismiss notification"
        >
          Dismiss
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** After staff login: set `?signedIn=1` or sessionStorage key; renders only when `authReady`. */
export function AppEntryNotice({ authReady }: { authReady: boolean }) {
  return (
    <Suspense fallback={null}>
      <AppEntryNoticeInner authReady={authReady} />
    </Suspense>
  );
}
