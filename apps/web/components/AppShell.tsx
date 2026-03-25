"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShopBrandMark } from "@/components/ShopBrandMark";
import { api } from "@/lib/api";
import { clearSession, getToken, getUser, type AuthUser } from "@/lib/auth";
import { reconnectSocket } from "@/lib/socket";
import type { RestaurantSettings } from "@/lib/types";

const links: { href: string; label: string; roles: string[] }[] = [
  { href: "/", label: "Dashboard", roles: ["ADMIN", "CASHIER"] },
  { href: "/tables", label: "Tables", roles: ["ADMIN", "CASHIER", "WAITER"] },
  { href: "/kitchen", label: "Kitchen", roles: ["ADMIN", "KITCHEN"] },
  { href: "/reports", label: "Reports", roles: ["ADMIN", "CASHIER"] },
  { href: "/admin/menu", label: "Menu", roles: ["ADMIN"] },
  { href: "/admin/users", label: "Users", roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", roles: ["ADMIN", "CASHIER"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shop, setShop] = useState<RestaurantSettings | null>(null);

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

  function logout() {
    clearSession();
    reconnectSocket();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  const visible = links.filter((l) => l.roles.includes(user.role));

  const shopName = shop?.name ?? "Restaurant POS";
  const shopAddress = shop?.address?.trim() ?? "";
  const shopLogo = shop?.logoUrl ?? null;

  return (
    <div className="flex min-h-screen">
      <aside className="no-print w-52 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-6 flex gap-2.5">
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
        <div className="mb-4 truncate text-sm text-[var(--muted)]" title={user.name}>
          {user.name}
        </div>
        <nav className="flex flex-col gap-1">
          {visible.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch
              className={`touch-manipulation rounded-lg px-3 py-2 text-sm font-medium transition duration-75 active:scale-[0.98] ${
                pathname === l.href
                  ? "bg-[var(--accent)] text-white"
                  : "hover:bg-[var(--border)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mt-8 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]"
        >
          Log out
        </button>
      </aside>
      <main className="min-h-screen flex-1 p-6">{children}</main>
    </div>
  );
}
