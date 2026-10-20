import { ChevronLeft, ChevronRight, Keyboard, Loader2, PanelLeftOpen, PanelRightOpen, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { backend } from "../../lib/backend";
import { useLibrary } from "../../store/library";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { IconButton } from "../common/controls";

export function TopBar() {
  const { route, back, forward, goBack, goForward, navigate, replace, setShortcutsOpen, searchFocusTick } = useUi();
  const scan = useLibrary((s) => s.scan);
  const { sidebar, rightPanel } = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const input = useRef<HTMLInputElement>(null);
  const q = route.name === "search" ? (route.q ?? "") : "";

  useEffect(() => {
    if (searchFocusTick) input.current?.focus();
  }, [searchFocusTick]);

  return (
    <div data-topbar className="sticky top-0 z-20 flex items-center gap-2 rounded-t-vy-lg bg-[color-mix(in_srgb,var(--vy-panel)_72%,transparent)] px-6 pt-4 pb-3 backdrop-blur-xl">
      {sidebar === "hidden" && (
        <IconButton label="Show sidebar" size="sm" onClick={() => update({ sidebar: "expanded" })}>
          <PanelLeftOpen size={18} />
        </IconButton>
      )}
      <IconButton label="Back" size="sm" disabled={!back.length} onClick={goBack} className="bg-fg/6">
        <ChevronLeft size={18} />
      </IconButton>
      <IconButton label="Forward" size="sm" disabled={!forward.length} onClick={goForward} className="bg-fg/6">
        <ChevronRight size={18} />
      </IconButton>

      <div className="relative ml-2 w-full max-w-md">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          ref={input}
          type="search"
          aria-label="Search your library"
          placeholder="Search songs, albums, artists"
          value={q}
          onFocus={() => route.name !== "search" && navigate({ name: "search", q })}
          onChange={(e) => (route.name === "search" ? replace({ name: "search", q: e.target.value }) : navigate({ name: "search", q: e.target.value }))}
          onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), replace({ name: "search", q: "" }))}
          className="h-10 w-full rounded-full border border-line bg-fg/6 pr-9 pl-10 text-sm text-fg outline-none placeholder:text-fg-3 transition-colors focus:border-accent/60 focus:bg-fg/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => replace({ name: "search", q: "" })} className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3 hover:text-fg">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {backend().isPreview && (
          <span
            className="rounded-full border border-amber-400/40 whitespace-nowrap bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200"
            title="Running in a web browser without the desktop runtime. The library is demo data with synthesized audio."
          >
            Browser preview · demo library
          </span>
        )}
        {scan?.running && (
          <button
            type="button"
            onClick={() => navigate({ name: "library", tab: "folders" })}
            className="flex items-center gap-2 rounded-full bg-fg/8 px-3 py-1.5 text-xs font-semibold text-fg-2"
            aria-live="polite"
          >
            <Loader2 size={13} className="animate-spin" />
            Importing {scan.total ? `${scan.processed}/${scan.total}` : "…"}
          </button>
        )}
        <IconButton label="Keyboard shortcuts" size="sm" onClick={() => setShortcutsOpen(true)}>
          <Keyboard size={18} />
        </IconButton>
        {!rightPanel && (
          <IconButton label="Show now playing panel" size="sm" onClick={() => update({ rightPanel: true })}>
            <PanelRightOpen size={18} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
