import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLibrary } from "../../store/library";
import { useUi } from "../../store/ui";
import { SHORTCUTS } from "../../hooks/useShortcuts";
import { Button, IconButton } from "./controls";

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[60] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="vy-pop vy-panel pointer-events-auto flex items-start gap-3 px-4 py-3 text-sm shadow-[var(--vy-shadow)]"
          style={{ ["--panel-alpha" as string]: "96%" }}
        >
          {t.kind === "error" ? (
            <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
          ) : t.kind === "success" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" />
          ) : (
            <Info size={18} className="mt-0.5 shrink-0 text-fg-2" />
          )}
          <span className="flex-1 text-fg">{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-fg-3 hover:text-fg">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,textarea,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("button,input,textarea,select,[tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`vy-pop vy-panel w-full ${wide ? "max-w-2xl" : "max-w-md"} p-6 shadow-[var(--vy-shadow)]`}
        style={{ ["--panel-alpha" as string]: "97%" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">{title}</h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-vy-sm border border-line bg-fg/6 px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus:bg-fg/8";

export function PlaylistDialog({
  initial,
  title,
  onSubmit,
  onClose,
}: {
  initial?: { name: string; description: string };
  title: string;
  onSubmit: (name: string, description: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onSubmit(name, description);
    setBusy(false);
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-fg-2">Name</span>
          <input className={inputClass} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="My playlist" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-fg-2">Description</span>
          <textarea
            className={`${inputClass} h-24 resize-none py-2`}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </label>
      </form>
    </Modal>
  );
}

export function NewPlaylistHost() {
  const state = useUi((s) => s.newPlaylist);
  const close = useUi((s) => s.closeNewPlaylist);
  const navigate = useUi((s) => s.navigate);
  const toast = useUi((s) => s.toast);
  const create = useLibrary((s) => s.createPlaylist);
  if (!state) return null;
  return (
    <PlaylistDialog
      title="Create playlist"
      onClose={close}
      onSubmit={async (name, description) => {
        const id = await create(name, description, state.trackIds);
        if (id !== null) {
          close();
          toast(`Created ${name.trim()}`, "success");
          navigate({ name: "playlist", id });
        }
      }}
    />
  );
}

export function ShortcutsHelp() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <Modal title="Keyboard shortcuts" onClose={() => setOpen(false)} wide>
      <ShortcutTable />
    </Modal>
  );
}

export function ShortcutTable() {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
      {SHORTCUTS.map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-4 border-b border-line py-2 text-sm">
          <dt className="text-fg-2">{s.label}</dt>
          <dd className="flex gap-1">
            {s.keys.map((k) => (
              <kbd key={k} className="rounded-md border border-line bg-fg/8 px-2 py-0.5 font-sans text-xs font-semibold text-fg">
                {k}
              </kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
