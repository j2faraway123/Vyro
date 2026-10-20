import { Play, Pause } from "lucide-react";
import type { ReactNode } from "react";
import type { Album, Artist } from "../../lib/types";
import { useLibrary } from "../../store/library";
import { usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";
import { sortAlbumTracks } from "../../lib/library";
import { Artwork } from "./Artwork";

function PlayFab({ onClick, label, playing }: { onClick: () => void; label: string; playing?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute right-2.5 bottom-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-6px_rgba(0,0,0,.6)] transition-all duration-200 hover:scale-105 focus-visible:translate-y-0 focus-visible:opacity-100 ${
        playing ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
      }`}
    >
      {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
    </button>
  );
}

export function AlbumCard({ album, subtitle }: { album: Album; subtitle?: ReactNode }) {
  const navigate = useUi((s) => s.navigate);
  const byId = useLibrary((s) => s.byId);
  const playTracks = usePlayer((s) => s.playTracks);
  const toggle = usePlayer((s) => s.toggle);
  const context = usePlayer((s) => s.context);
  const isPlaying = usePlayer((s) => s.playing && s.source === "local");
  const playLocal = usePlayer((s) => s.playLocal);
  const active = context === `album:${album.key}`;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${album.title}, album by ${album.artist}`}
      onClick={() => navigate({ name: "album", key: album.key })}
      onKeyDown={(e) => e.key === "Enter" && navigate({ name: "album", key: album.key })}
      className="group vy-enter cursor-pointer rounded-vy p-3 transition-colors duration-200 hover:bg-fg/6"
    >
      <div className="relative mb-3 aspect-square">
        <Artwork src={album.artwork} alt={`${album.title} cover`} className="h-full w-full shadow-[0_10px_30px_-12px_rgba(0,0,0,.7)]" iconSize={40} rounded="rounded-vy" />
        <PlayFab
          label={active && isPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
          playing={active && isPlaying}
          onClick={() => (active ? (isPlaying ? toggle() : playLocal()) : playTracks(sortAlbumTracks(album.trackIds, byId), 0, `album:${album.key}`))}
        />
      </div>
      <div className="truncate font-bold text-fg">{album.title}</div>
      <div className="mt-0.5 truncate text-sm text-fg-2">{subtitle ?? album.artist}</div>
    </div>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const navigate = useUi((s) => s.navigate);
  const playTracks = usePlayer((s) => s.playTracks);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${artist.name}, artist`}
      onClick={() => navigate({ name: "artist", artist: artist.name })}
      onKeyDown={(e) => e.key === "Enter" && navigate({ name: "artist", artist: artist.name })}
      className="group vy-enter cursor-pointer rounded-vy p-3 text-center transition-colors duration-200 hover:bg-fg/6"
    >
      <div className="relative mb-3 aspect-square">
        <Artwork src={artist.artwork} alt="" className="h-full w-full shadow-[0_10px_30px_-12px_rgba(0,0,0,.7)]" iconSize={40} rounded="rounded-full" />
        <PlayFab label={`Play ${artist.name}`} onClick={() => playTracks(artist.trackIds, 0, `artist:${artist.name}`)} />
      </div>
      <div className="truncate font-bold text-fg">{artist.name}</div>
      <div className="mt-0.5 text-sm text-fg-2">Artist</div>
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-1">{children}</div>;
}

export function Shelf({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-end justify-between px-3">
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A single row of cards that fits the width: extra cards fall into zero-height rows. */
export function CardRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] grid-rows-[auto] auto-rows-[0] gap-x-1 gap-y-0 overflow-hidden">
      {children}
    </div>
  );
}
