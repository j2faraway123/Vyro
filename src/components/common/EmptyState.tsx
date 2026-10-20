import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  children,
  actions,
  compact,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`vy-enter mx-auto flex max-w-md flex-col items-center text-center ${compact ? "py-10" : "py-20"}`}>
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-fg/6 text-fg-2 ring-1 ring-line">{icon}</div>
      <h2 className="text-lg font-bold text-fg">{title}</h2>
      {children && <div className="mt-2 text-sm leading-relaxed text-fg-2">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorBanner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-vy border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
