import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Restaurant POS
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <Link href="/demo" className="text-[var(--muted)] hover:text-[var(--text)]">
              Request demo
            </Link>
            <Link href="/signup" className="text-[var(--muted)] hover:text-[var(--text)]">
              Get started
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white hover:brightness-110"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
