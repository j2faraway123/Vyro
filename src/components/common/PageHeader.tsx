import type { ReactNode } from "react";
import { albumBackground } from "../../lib/color";
import { useActiveTheme } from "../../store/settings";

/** Large page hero tinted from the item's artwork palette. */
export function PageHeader({
  kind,
  title,
  art,
  palette,
  meta,
  description,
  actions,
}: {
  kind: string;
  title: string;
  art?: ReactNode;
  palette?: string[] | null;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const theme = useActiveTheme();
  const p = palette?.length ? albumBackground(palette, theme.mode) : null;
  return (
    <header className="vy-enter relative mb-6 overflow-hidden rounded-vy-lg px-6 pt-10 pb-6">
      <div
        aria-hidden
        className="absolute inset-0 -z-0 transition-[background] duration-700"
        style={{
          background: p
            ? `linear-gradient(160deg, ${p.c1}cc 0%, ${p.c2}88 55%, transparent 100%)`
            : "linear-gradient(160deg, color-mix(in srgb, var(--vy-accent) 22%, transparent), transparent 80%)",
        }}
      />
      <div className="relative flex items-end gap-6">
        {art && <div className="shrink-0">{art}</div>}
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-xs font-bold tracking-wider text-fg-2 uppercase">{kind}</div>
          <h1 className="truncate pb-1 text-[clamp(2rem,4.5vw,4.25rem)] leading-none font-extrabold tracking-tight text-fg" title={title}>
            {title}
          </h1>
          {description && <p className="mt-3 line-clamp-2 max-w-2xl text-sm text-fg-2">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm text-fg-2">{meta}</div>}
        </div>
      </div>
      {actions && <div className="relative mt-6 flex items-center gap-3">{actions}</div>}
    </header>
  );
}

export function BigPlayButton({ onClick, playing, label }: { onClick: () => void; playing?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_10px_30px_-8px_var(--vy-accent)] transition-transform duration-150 hover:scale-105 active:scale-95"
    >
      {playing ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ml-1">
          <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
        </svg>
      )}
    </button>
  );
}
