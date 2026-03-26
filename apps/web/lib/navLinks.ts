export type ShellNavLink = {
  href: string;
  label: string;
  shortLabel: string;
  roles: string[];
};

/** Sidebar + mobile tabs routes (single source of truth for AppShell). */
export const shellNavLinks: ShellNavLink[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", roles: ["ADMIN", "CASHIER"] },
  { href: "/walk-in", label: "Walk-in", shortLabel: "Walk-in", roles: ["ADMIN", "CASHIER", "WAITER"] },
  { href: "/tables", label: "Tables", shortLabel: "Tables", roles: ["ADMIN", "CASHIER", "WAITER"] },
  { href: "/kitchen", label: "Kitchen", shortLabel: "Kitchen", roles: ["ADMIN", "KITCHEN"] },
  { href: "/reports", label: "Reports", shortLabel: "Reports", roles: ["ADMIN", "CASHIER"] },
  { href: "/admin/menu", label: "Menu", shortLabel: "Menu", roles: ["ADMIN"] },
  { href: "/admin/users", label: "Users", shortLabel: "Users", roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", shortLabel: "Settings", roles: ["ADMIN", "CASHIER"] },
];

/** Every app-shell route (prefetch chunks for fastest cross-role experience on shared devices). */
export function allShellHrefs(): string[] {
  return [...new Set(shellNavLinks.map((l) => l.href))];
}
