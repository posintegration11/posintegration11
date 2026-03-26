import { api } from "./api";
import { allShellHrefs } from "./navLinks";

/** Matches dashboard/reports local calendar-day query. */
function calendarDayQuery(): string {
  const n = new Date();
  const from = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
  const to = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

let lastApiWarmupAt = 0;

/**
 * Primes common GET endpoints (connection + server caches). Safe to call multiple times;
 * coalesced to once per ~3s to avoid duplicate storms right after login + AppShell mount.
 */
export function warmupTenantApis(role: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastApiWarmupAt < 3000) return;
  lastApiWarmupAt = now;

  const q = calendarDayQuery();
  const tasks: Promise<unknown>[] = [
    api("/settings").catch(() => undefined),
    api("/tables").catch(() => undefined),
    api("/menu/categories").catch(() => undefined),
  ];

  if (role === "ADMIN" || role === "CASHIER") {
    tasks.push(
      api(`/reports/overview${q}`).catch(() => undefined),
      api(`/reports/top-items${q}`).catch(() => undefined),
      api(`/reports/daily-sales${q}`).catch(() => undefined),
      api(`/reports/orders-summary${q}`).catch(() => undefined),
      api(`/reports/payment-summary${q}`).catch(() => undefined),
      api(`/reports/table-stats${q}`).catch(() => undefined),
    );
  }

  if (role === "ADMIN") {
    tasks.push(api("/menu/categories/all").catch(() => undefined), api("/users").catch(() => undefined));
  }

  if (role === "KITCHEN" || role === "ADMIN") {
    tasks.push(api("/kot").catch(() => undefined));
  }

  void Promise.allSettled(tasks);
}

type PrefetchRouter = { prefetch: (href: string) => void };

/** Prefetch all shell routes so page transitions reuse cached RSC + JS. */
export function prefetchAllShellRoutes(router: PrefetchRouter): void {
  for (const href of allShellHrefs()) {
    try {
      router.prefetch(href);
    } catch {
      /* ignore */
    }
  }
}
