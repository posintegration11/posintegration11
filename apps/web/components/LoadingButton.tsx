import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "@/components/Spinner";

export type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  /** When true (default), spinner replaces label while loading to avoid layout shift. */
  spinnerOnly?: boolean;
  children: ReactNode;
};

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(function LoadingButton(
  { loading, disabled, spinnerOnly = true, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={Boolean(disabled) || Boolean(loading)}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center gap-2 ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner className="size-4 shrink-0" />
          {!spinnerOnly ? <span>{children}</span> : null}
        </>
      ) : (
        children
      )}
    </button>
  );
});
