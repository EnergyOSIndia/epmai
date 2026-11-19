import type { ReactNode } from "react";

/** Centered card used by the login and OTP pages (no app header/nav). */
export function AuthLayout({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-full place-items-center bg-muted/20 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="condensed block text-2xl font-bold tracking-tight">EPM AI</span>
          <span className="mt-1 inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">Energy Planning &amp; Management</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
