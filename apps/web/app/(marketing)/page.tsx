import Link from "next/link";

export default function MarketingHomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Run your restaurant floor, kitchen, and billing in one place.
        </h1>
        <p className="text-lg text-[var(--muted)]">
          Table service, walk-in tickets, kitchen display, reports, and invoices — ready for your team after a quick
          email verification.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="inline-flex touch-manipulation items-center justify-center rounded-xl bg-[var(--accent)] px-8 py-4 text-center text-base font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]"
          >
            Get started
          </Link>
          <Link
            href="/demo"
            className="inline-flex touch-manipulation items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-8 py-4 text-center text-base font-semibold transition hover:border-[var(--accent)]"
          >
            Request a demo
          </Link>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
