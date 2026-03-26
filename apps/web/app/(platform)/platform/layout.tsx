export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">{children}</div>;
}
