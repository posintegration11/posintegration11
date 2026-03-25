"use client";

type Size = "md" | "sm";

const sizeClass: Record<Size, string> = {
  md: "h-10 w-10 text-sm",
  sm: "h-9 w-9 text-xs",
};

/** Logo or initial — used in header and sidebar */
export function ShopBrandMark({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: Size;
}) {
  const box = sizeClass[size];
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URLs / arbitrary shop URLs
      <img
        src={logoUrl}
        alt=""
        className={`${box} shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] object-contain`}
      />
    );
  }
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--accent)]/15 font-bold text-[var(--accent)]`}
      aria-hidden
    >
      {initial}
    </div>
  );
}
