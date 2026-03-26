"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ShopBrandMark } from "@/components/ShopBrandMark";
import { api } from "@/lib/api";
import { clearSession, getToken, getUser, type AuthUser } from "@/lib/auth";
import { reconnectSocket } from "@/lib/socket";
import type { RestaurantSettings } from "@/lib/types";

const links: { href: string; label: string; shortLabel: string; roles: string[] }[] = [
  { href: "/", label: "Dashboard", shortLabel: "Home", roles: ["ADMIN", "CASHIER"] },
  { href: "/walk-in", label: "Walk-in", shortLabel: "Walk-in", roles: ["ADMIN", "CASHIER", "WAITER"] },
  { href: "/tables", label: "Tables", shortLabel: "Tables", roles: ["ADMIN", "CASHIER", "WAITER"] },
  { href: "/kitchen", label: "Kitchen", shortLabel: "Kitchen", roles: ["ADMIN", "KITCHEN"] },
  { href: "/reports", label: "Reports", shortLabel: "Reports", roles: ["ADMIN", "CASHIER"] },
  { href: "/admin/menu", label: "Menu", shortLabel: "Menu", roles: ["ADMIN"] },
  { href: "/admin/users", label: "Users", shortLabel: "Users", roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", shortLabel: "Settings", roles: ["ADMIN", "CASHIER"] },
];

const MOBILE_TAB_COUNT = 4;

function NavGlyph({ href }: { href: string }) {
  const common = "size-5 shrink-0";
  switch (href) {
    case "/":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "/walk-in":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M8 11h8m-8 0v6a2 2 0 002 2h4a2 2 0 002-2v-6" />
        </svg>
      );
    case "/tables":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      );
    case "/kitchen":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        </svg>
      );
    case "/reports":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m4 6V9m4 8V7M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    case "/admin/menu":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "/admin/users":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case "/settings":
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return (
        <svg className={common} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      );
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shop, setShop] = useState<RestaurantSettings | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileDrawerOpen(false), []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    void api<{ id: string; name: string; email: string; role: string }>("/auth/me")
      .then(async (me) => {
        setUser(me);
        try {
          const s = await api<RestaurantSettings>("/settings");
          setShop(s);
        } catch {
          setShop(null);
        }
      })
      .catch(() => {
        clearSession();
        reconnectSocket();
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    function onShopUpdated() {
      void api<RestaurantSettings>("/settings")
        .then(setShop)
        .catch(() => {});
    }
    window.addEventListener("pos-shop-updated", onShopUpdated);
    return () => window.removeEventListener("pos-shop-updated", onShopUpdated);
  }, []);

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMobile();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileDrawerOpen, closeMobile]);

  function logout() {
    clearSession();
    reconnectSocket();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  const visible = links.filter((l) => l.roles.includes(user.role));
  const mobileTabs = visible.slice(0, MOBILE_TAB_COUNT);
  const mobileOverflow = visible.slice(MOBILE_TAB_COUNT);
  const hasOverflow = mobileOverflow.length > 0;

  const shopName = shop?.name ?? "Restaurant POS";
  const shopAddress = shop?.address?.trim() ?? "";
  const shopLogo = shop?.logoUrl ?? null;

  const linkClass = (href: string) =>
    `touch-manipulation rounded-lg px-3 py-2.5 text-sm font-medium transition duration-75 active:scale-[0.98] md:py-2 ${
      pathname === href ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--border)]"
    }`;

  const sidebarInner = (
    <>
      <div className="mb-5 flex gap-2.5 md:mb-6">
        <ShopBrandMark name={shopName} logoUrl={shopLogo} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold leading-snug text-[var(--text)]" title={shopName}>
            {shopName}
          </div>
          {shopAddress ? (
            <p
              className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-snug text-[var(--muted)]"
              title={shopAddress}
            >
              {shopAddress}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]/75">No address set</p>
          )}
        </div>
      </div>
      <div className="mb-3 truncate text-sm text-[var(--muted)] md:mb-4" title={user.name}>
        {user.name}
      </div>
      <nav className="flex flex-col gap-0.5 md:gap-1">
        {visible.map((l) => (
          <Link key={l.href} href={l.href} prefetch className={`flex items-center gap-2.5 ${linkClass(l.href)}`}>
            <NavGlyph href={l.href} />
            {l.label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        onClick={logout}
        className="mt-5 w-full shrink-0 touch-manipulation rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm transition duration-75 hover:bg-[var(--border)] active:scale-[0.99] md:mt-6 md:py-2"
      >
        Log out
      </button>
    </>
  );

  return (
    <div className="flex min-h-dvh min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh max-h-dvh w-52 shrink-0 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain border-r border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`no-print fixed inset-0 z-[60] md:hidden ${mobileDrawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileDrawerOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
            mobileDrawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeMobile}
          aria-label="Close menu"
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-[min(100vw-3rem,18rem)] flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl transition-transform duration-200 ease-out safe-pt ${
            mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Menu</span>
            <button
              type="button"
              onClick={closeMobile}
              className="touch-manipulation rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{sidebarInner}</div>
        </div>
      </div>

      <div className="flex min-h-dvh min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2.5 backdrop-blur-md safe-pt md:hidden">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="touch-manipulation -ml-1 rounded-lg p-2 text-[var(--text)] hover:bg-[var(--border)]/60"
            aria-label="Open menu"
          >
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ShopBrandMark name={shopName} logoUrl={shopLogo} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-[var(--text)]">{shopName}</p>
              <p className="truncate text-[10px] text-[var(--muted)]">{user.name}</p>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:px-4 md:px-6 md:py-6 md:pb-6">
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav className="no-print fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom,0px)] pt-1 backdrop-blur-md md:hidden">
          <div className="mx-auto flex w-full max-w-lg items-stretch justify-around gap-0.5 px-1">
            {mobileTabs.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                prefetch
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 touch-manipulation transition duration-75 active:scale-[0.97] ${
                  pathname === l.href ? "text-[var(--accent)]" : "text-[var(--muted)]"
                }`}
              >
                <span className={pathname === l.href ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
                  <NavGlyph href={l.href} />
                </span>
                <span className="w-full truncate text-center text-[10px] font-semibold leading-tight">
                  {l.shortLabel}
                </span>
              </Link>
            ))}
            {hasOverflow ? (
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 touch-manipulation transition duration-75 active:scale-[0.97] ${
                  mobileOverflow.some((l) => pathname === l.href) ? "text-[var(--accent)]" : "text-[var(--muted)]"
                }`}
              >
                <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
                </svg>
                <span className="text-[10px] font-semibold">More</span>
              </button>
            ) : null}
          </div>
        </nav>
      </div>
    </div>
  );
}
