"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingButton } from "@/components/LoadingButton";

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Chrome/Edge/Android: native install. iOS: “Share → Add to Home Screen” (no store APK). */
export function PwaInstallHint() {
  const [mounted, setMounted] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEventLike | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || process.env.NODE_ENV !== "production") return;
    if (isStandalone()) return;
    if (sessionStorage.getItem("pwa-install-dismissed") === "1") {
      setDismissed(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEventLike);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIosDevice()) {
      t = setTimeout(() => setShowIosTip(true), 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      if (t) clearTimeout(t);
    };
  }, [mounted]);

  const dismiss = useCallback(() => {
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  }, []);

  const onInstallClick = async () => {
    if (!deferred) return;
    setInstallBusy(true);
    try {
      await deferred.prompt();
    } finally {
      setInstallBusy(false);
      dismiss();
    }
  };

  if (!mounted || dismissed || isStandalone()) return null;

  if (deferred) {
    return (
      <div
        className="safe-pb fixed bottom-0 left-0 right-0 z-[100] border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-lg sm:px-4"
        role="region"
        aria-label="Install app"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text)]">
            Install <strong className="font-semibold">Restaurant POS</strong> for a full-screen app on
            this device — no Play Store needed.
          </p>
          <div className="flex shrink-0 gap-2">
            <LoadingButton
              type="button"
              loading={installBusy}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
              onClick={() => void onInstallClick()}
            >
              Install
            </LoadingButton>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]"
              onClick={dismiss}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showIosTip && isIosDevice()) {
    return (
      <div
        className="safe-pb fixed bottom-0 left-0 right-0 z-[100] border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-lg sm:px-4"
        role="region"
        aria-label="Add to Home Screen"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text)]">
            Add this app to your Home Screen: tap <strong className="font-semibold">Share</strong>, then{" "}
            <strong className="font-semibold">Add to Home Screen</strong>.
          </p>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]"
            onClick={dismiss}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return null;
}
