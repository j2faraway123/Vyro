import { useEffect } from "react";
import { usePlayer } from "../store/player";
import { useLibrary } from "../store/library";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";

export const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Play / pause", keys: ["Space"] },
  { label: "Next track", keys: ["Ctrl", "→"] },
  { label: "Previous track", keys: ["Ctrl", "←"] },
  { label: "Seek forward 5 s", keys: ["→"] },
  { label: "Seek back 5 s", keys: ["←"] },
  { label: "Volume up", keys: ["Ctrl", "↑"] },
  { label: "Volume down", keys: ["Ctrl", "↓"] },
  { label: "Mute", keys: ["M"] },
  { label: "Shuffle", keys: ["S"] },
  { label: "Repeat mode", keys: ["R"] },
  { label: "Favorite current track", keys: ["Shift", "F"] },
  { label: "Lyrics panel", keys: ["L"] },
  { label: "Queue", keys: ["Q"] },
  { label: "Fullscreen lyrics", keys: ["F"] },
  { label: "Search", keys: ["Ctrl", "K"] },
  { label: "Settings", keys: ["Ctrl", ","] },
  { label: "Back", keys: ["Alt", "←"] },
  { label: "Forward", keys: ["Alt", "→"] },
  { label: "Show shortcuts", keys: ["?"] },
];

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = usePlayer.getState();
      const ui = useUi.getState();
      const settings = useSettings.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      // Global shortcuts that also work while typing.
      if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.navigate({ name: "search" });
        ui.focusSearch();
        return;
      }
      if (ctrl && e.key === ",") {
        e.preventDefault();
        ui.navigate({ name: "settings" });
        return;
      }
      if (typing(e)) return;
      // Let focused buttons/links/sliders handle Space and arrows themselves.
      const role = (e.target as HTMLElement)?.getAttribute?.("role");
      const onControl = (e.target as HTMLElement)?.closest?.("button,a,[role=slider],input,[role=row],[role=menuitem]");

      if (e.altKey && e.key === "ArrowLeft") return void (e.preventDefault(), ui.goBack());
      if (e.altKey && e.key === "ArrowRight") return void (e.preventDefault(), ui.goForward());

      switch (true) {
        case e.key === " " && !onControl:
          e.preventDefault();
          p.toggle();
          break;
        case ctrl && e.key === "ArrowRight":
          e.preventDefault();
          p.next();
          break;
        case ctrl && e.key === "ArrowLeft":
          e.preventDefault();
          p.prev();
          break;
        case ctrl && e.key === "ArrowUp":
          e.preventDefault();
          p.setVolume(p.volume + 0.05);
          break;
        case ctrl && e.key === "ArrowDown":
          e.preventDefault();
          p.setVolume(p.volume - 0.05);
          break;
        case !ctrl && e.key === "ArrowRight" && !onControl && role !== "slider":
          p.seekBy(5);
          break;
        case !ctrl && e.key === "ArrowLeft" && !onControl && role !== "slider":
          p.seekBy(-5);
          break;
        case !ctrl && !e.altKey && e.key.toLowerCase() === "m":
          p.toggleMute();
          break;
        case !ctrl && !e.altKey && e.key === "s":
          p.toggleShuffle();
          break;
        case !ctrl && !e.altKey && e.key === "r":
          p.cycleRepeat();
          break;
        case !ctrl && e.key === "F": {
          const cur = p.current();
          if (cur) useLibrary.getState().toggleFavorite(cur.id);
          break;
        }
        case !ctrl && e.key === "f":
          ui.setFullscreenLyrics(!ui.fullscreenLyrics);
          break;
        case !ctrl && e.key === "l":
          settings.update((s) =>
            s.rightPanel && s.rightTab === "lyrics" ? { rightPanel: false } : { rightPanel: true, rightTab: "lyrics" },
          );
          break;
        case !ctrl && e.key === "q":
          settings.update((s) =>
            s.rightPanel && s.rightTab === "queue" ? { rightPanel: false } : { rightPanel: true, rightTab: "queue" },
          );
          break;
        case e.key === "?":
          ui.setShortcutsOpen(true);
          break;
        case e.key === "/":
          e.preventDefault();
          ui.navigate({ name: "search" });
          ui.focusSearch();
          break;
        case e.key === "Escape" && ui.fullscreenLyrics:
          ui.setFullscreenLyrics(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
