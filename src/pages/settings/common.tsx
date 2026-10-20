import type { ReactNode } from "react";

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="vy-enter mb-10">
      <h2 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-fg-2">{description}</p>}
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

export function Group({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="vy-elevated rounded-vy p-1">
      {title && (
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <h3 className="text-xs font-bold tracking-wider text-fg-3 uppercase">{title}</h3>
          {aside}
        </div>
      )}
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

export function Row({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-6 px-4 py-3.5">
      <div className="min-w-[12rem] flex-1">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-fg">
          {label}
        </label>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-fg-2">{hint}</div>}
      </div>
      {children && <div className="flex max-w-[65%] flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative inline-flex h-9 items-center gap-2 rounded-full border border-line bg-fg/6 pr-3 pl-1 text-xs font-semibold text-fg-2" title={label}>
      <span className="h-7 w-7 rounded-full ring-1 ring-line" style={{ background: value }} />
      <span className="font-mono uppercase">{value}</span>
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}
