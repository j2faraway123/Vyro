import { CheckCircle2, CircleDashed, FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Slider, Toggle } from "../../components/common/controls";
import { ShortcutTable } from "../../components/common/Overlays";
import { backend, errorMessage } from "../../lib/backend";
import { plural } from "../../lib/format";
import type { AppInfo } from "../../lib/types";
import { useLibrary } from "../../store/library";
import { useSettings } from "../../store/settings";
import { toast, useUi } from "../../store/ui";
import { Group, Row, Section } from "./common";

function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    backend().appInfo().then(setInfo).catch(() => {});
  }, []);
  return info;
}

export function PlaybackSection() {
  const { settings, update } = useSettings();
  const info = useAppInfo();
  return (
    <Section title="Playback">
      <Group>
        <Row label="Resume where you left off" hint="Restore the queue and position (paused) when Vyro starts.">
          <Toggle label="Resume playback" checked={settings.resumePlayback} onChange={(v) => update({ resumePlayback: v })} />
        </Row>
        <Row label="Supported formats" hint="Playback uses the system WebView's decoders. ALAC inside .m4a isn't supported by WebView2 on Windows.">
          <span className="text-sm text-fg-2">{info?.formats.map((f) => f.toUpperCase()).join(", ")}</span>
        </Row>
        <Row label="Media keys and system controls" hint="Vyro publishes track info to the operating system, so keyboard media keys and the Windows media overlay work.">
          <CheckCircle2 size={18} className="text-accent" />
        </Row>
      </Group>
    </Section>
  );
}

export function LyricsSection() {
  const { settings, update } = useSettings();
  return (
    <Section title="Lyrics" description="Vyro looks for lyrics in this order: a .lrc or .txt file next to the track with the same name, lyrics embedded in the file's tags, then LRCLIB if online lyrics are on.">
      <Group>
        <Row
          label="Online lyrics (LRCLIB)"
          hint="Sends the track title, artist, album and duration to lrclib.net, a free, documented lyrics database. No account or key needed. Results are cached locally."
        >
          <Toggle label="Online lyrics" checked={settings.onlineLyrics} onChange={(v) => update({ onlineLyrics: v })} />
        </Row>
        <Row label="Timing offset" hint={`${settings.lyricsOffset > 0 ? "+" : ""}${settings.lyricsOffset.toFixed(1)} s. Positive values show lines earlier.`}>
          <div className="w-48">
            <Slider label="Lyrics timing offset" min={-3} max={3} step={0.1} value={settings.lyricsOffset} onChange={(v) => update({ lyricsOffset: v })} alwaysThumb />
          </div>
        </Row>
        <Row label="Text size" hint={`${Math.round(settings.lyricsSize * 100)}%`}>
          <div className="w-48">
            <Slider label="Lyrics text size" min={0.8} max={1.6} step={0.05} value={settings.lyricsSize} onChange={(v) => update({ lyricsSize: v })} alwaysThumb />
          </div>
        </Row>
        <Row label="Lyrics cache" hint="Clears downloaded lyrics so they're fetched again.">
          <Button
            icon={<Trash2 size={14} />}
            onClick={async () => {
              try {
                await backend().clearLyricsCache();
                toast("Lyrics cache cleared", "success");
              } catch (e) {
                toast(errorMessage(e), "error");
              }
            }}
          >
            Clear cache
          </Button>
        </Row>
      </Group>
    </Section>
  );
}

export function LibrarySection() {
  const { folders, tracks, rescan } = useLibrary();
  const navigate = useUi((s) => s.navigate);
  const info = useAppInfo();
  return (
    <Section title="Library">
      <Group>
        <Row label="Music folders" hint={`${plural(folders.length, "folder")} · ${plural(tracks.length, "track")}`}>
          <Button icon={<FolderOpen size={14} />} onClick={() => navigate({ name: "library", tab: "folders" })}>
            Manage folders
          </Button>
          <Button onClick={() => rescan(false)} disabled={!folders.length}>
            Rescan
          </Button>
        </Row>
        <Row label="Database and cache location" hint="SQLite database, artwork cache, filter lists and backgrounds.">
          <code className="max-w-80 truncate rounded bg-fg/8 px-2 py-1 text-xs text-fg-2 select-text" title={info?.dataDir}>
            {info?.dataDir}
          </code>
        </Row>
      </Group>
    </Section>
  );
}

export function ShortcutsSection() {
  return (
    <Section title="Keyboard shortcuts" description="Shortcuts work anywhere except while typing in a text field. Press ? to show this list.">
      <Group>
        <div className="p-4">
          <ShortcutTable />
        </div>
      </Group>
    </Section>
  );
}

const FEATURES: [string, boolean, string][] = [
  ["Local import (folders, files, drag and drop)", true, "Tags and embedded or folder artwork via lofty"],
  ["Playback, queue, shuffle, repeat, seeking", true, "System decoders: WebView2 on Windows, GStreamer on Linux"],
  ["SQLite library, favorites, history, playlists", true, ""],
  ["Album-reactive backgrounds and presets", true, ""],
  ["Synced lyrics (LRC files, tags, LRCLIB)", true, ""],
  ["Themes with JSON import and export", true, ""],
  ["Vyro Shield network blocking (Windows, Linux)", true, "WebView2 request filter / WebKitGTK content filters"],
  ["Vyro Shield network blocking (macOS)", false, "Not implemented; element hiding only"],
  ["Streaming-service integrations", false, "Not included; Vyro plays local files"],
  ["Gapless playback and crossfade", false, "Not implemented"],
];

export function AboutSection() {
  const info = useAppInfo();
  return (
    <Section title="About Vyro">
      <Group>
        <Row label="Version">
          <span className="text-sm text-fg-2">{info?.version}</span>
        </Row>
        <Row label="Platform">
          <span className="text-sm text-fg-2">{info?.platform}</span>
        </Row>
      </Group>
      <Group title="Feature status">
        {FEATURES.map(([name, done, note]) => (
          <Row key={name} label={name} hint={note || undefined}>
            {done ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <CheckCircle2 size={15} /> Working
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-3">
                <CircleDashed size={15} /> Not available
              </span>
            )}
          </Row>
        ))}
      </Group>
    </Section>
  );
}
