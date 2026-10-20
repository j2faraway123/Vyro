import { Info, Keyboard, Library, MicVocal, MonitorPlay, Palette, Play, Shield, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useUi, type SettingsSection } from "../../store/ui";
import { AppearanceSection } from "./AppearanceSection";
import { BackgroundSection } from "./BackgroundSection";
import { AboutSection, LibrarySection, LyricsSection, PlaybackSection, ShortcutsSection } from "./OtherSections";
import { ShieldSection } from "./ShieldSection";
import { YouTubeSection } from "./YouTubeSection";

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={17} /> },
  { id: "background", label: "Background", icon: <Sparkles size={17} /> },
  { id: "shield", label: "Vyro Shield", icon: <Shield size={17} /> },
  { id: "youtube", label: "YouTube", icon: <MonitorPlay size={17} /> },
  { id: "playback", label: "Playback", icon: <Play size={17} /> },
  { id: "lyrics", label: "Lyrics", icon: <MicVocal size={17} /> },
  { id: "library", label: "Library", icon: <Library size={17} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={17} /> },
  { id: "about", label: "About", icon: <Info size={17} /> },
];

export function SettingsPage({ section = "appearance" }: { section?: SettingsSection }) {
  const replace = useUi((s) => s.replace);
  return (
    <div className="flex gap-8 px-3">
      <nav aria-label="Settings sections" className="sticky top-20 w-48 shrink-0 self-start">
        <h1 className="mb-4 px-3 text-3xl font-extrabold tracking-tight text-fg">Settings</h1>
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={section === s.id ? "page" : undefined}
                onClick={() => replace({ name: "settings", section: s.id })}
                className={`flex h-9 w-full items-center gap-3 rounded-vy-sm px-3 text-sm font-semibold transition-colors ${
                  section === s.id ? "bg-fg/10 text-fg" : "text-fg-2 hover:bg-fg/5 hover:text-fg"
                }`}
              >
                <span className={section === s.id ? "text-accent" : ""}>{s.icon}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 pt-14">
        {section === "appearance" && <AppearanceSection />}
        {section === "background" && <BackgroundSection />}
        {section === "shield" && <ShieldSection />}
        {section === "youtube" && <YouTubeSection />}
        {section === "playback" && <PlaybackSection />}
        {section === "lyrics" && <LyricsSection />}
        {section === "library" && <LibrarySection />}
        {section === "shortcuts" && <ShortcutsSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
