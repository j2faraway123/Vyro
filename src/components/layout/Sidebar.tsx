import {
  CirclePlay,
  Compass,
  FolderPlus,
  Globe,
  Heart,
  History,
  Library,
  ListMusic,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLibrary } from "../../store/library";
import { usePlayer } from "../../store/player";
import { useSettings } from "../../store/settings";
import { useShield } from "../../store/shield";
import { useUi, type Route } from "../../store/ui";
import { Equalizer, IconButton } from "../common/controls";

function NavItem({ icon, label, route, collapsed, badge }: { icon: ReactNode; label: string; route: Route; collapsed: boolean; badge?: ReactNode }) {
  const current = useUi((s) => s.route);
  const navigate = useUi((s) => s.navigate);
  const active =
    current.name === route.name ||
    (route.name === "library" && (current.name === "album" || current.name === "artist")) ||
    (route.name === "playlists" && current.name === "playlist");
  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`group relative flex h-10 w-full items-center gap-3.5 rounded-vy-sm px-3 text-sm font-semibold transition-colors duration-150 ${
        active ? "bg-fg/10 text-fg" : "text-fg-2 hover:bg-fg/5 hover:text-fg"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" />}
      <span className={active ? "text-accent" : ""}>{icon}</span>
      {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
      {!collapsed && badge}
    </button>
  );
}

export function Sidebar() {
  const mode = useSettings((s) => s.settings.sidebar);
  const update = useSettings((s) => s.update);
  const playlists = useLibrary((s) => s.playlists);
  const addFolders = useLibrary((s) => s.addFolders);
  const navigate = useUi((s) => s.navigate);
  const route = useUi((s) => s.route);
  const openNewPlaylist = useUi((s) => s.openNewPlaylist);
  const context = usePlayer((s) => s.context);
  const playing = usePlayer((s) => s.playing && s.source === "local");
  const shieldOn = useShield((s) => s.state?.config.enabled ?? false);
  const collapsed = mode === "collapsed";
  const icon = 19;

  return (
    <nav aria-label="Main" className={`vy-panel flex min-h-0 flex-col py-4 ${collapsed ? "px-2" : "px-3"}`}>
      <div className={`mb-5 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <img src="/vyro-logo.svg" alt="" className="h-8 w-8" draggable={false} />
            <span className="text-xl font-extrabold tracking-tight text-fg">Vyro</span>
          </div>
        )}
        <IconButton
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          size="sm"
          onClick={() => update({ sidebar: collapsed ? "expanded" : "collapsed" })}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </IconButton>
      </div>

      <div className="space-y-0.5">
        <NavItem icon={<Compass size={icon} />} label="Discover" route={{ name: "discover" }} collapsed={collapsed} />
        <NavItem icon={<Search size={icon} />} label="Search" route={{ name: "search" }} collapsed={collapsed} />
        <NavItem icon={<Library size={icon} />} label="Library" route={{ name: "library" }} collapsed={collapsed} />
        <NavItem icon={<Heart size={icon} />} label="Favorites" route={{ name: "favorites" }} collapsed={collapsed} />
        <NavItem icon={<ListMusic size={icon} />} label="Playlists" route={{ name: "playlists" }} collapsed={collapsed} />
        <NavItem icon={<History size={icon} />} label="Recently Played" route={{ name: "recent" }} collapsed={collapsed} />
        <NavItem icon={<MonitorPlay size={icon} />} label="YouTube" route={{ name: "youtube" }} collapsed={collapsed} />
        <NavItem icon={<CirclePlay size={icon} />} label="YouTube Music" route={{ name: "ytm" }} collapsed={collapsed} />
        <NavItem
          icon={<Globe size={icon} />}
          label="Web"
          route={{ name: "web" }}
          collapsed={collapsed}
          badge={
            <span title={shieldOn ? "Vyro Shield is on" : "Vyro Shield is off"} className={shieldOn ? "text-accent" : "text-fg-3"}>
              {shieldOn ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
            </span>
          }
        />
      </div>

      <div className={`mt-6 mb-2 flex items-center ${collapsed ? "justify-center" : "justify-between pr-1 pl-3"}`}>
        {!collapsed && <span className="text-xs font-bold tracking-wider text-fg-3 uppercase">Playlists</span>}
        <IconButton label="Create playlist" size="sm" onClick={() => openNewPlaylist()}>
          <Plus size={17} />
        </IconButton>
      </div>
      <div className="vy-scroll -mx-1 min-h-0 flex-1 px-1">
        {playlists.map((p) => {
          const active = route.name === "playlist" && route.id === p.id;
          const isPlaying = context === `playlist:${p.id}`;
          return (
            <button
              key={p.id}
              type="button"
              title={p.name}
              onClick={() => navigate({ name: "playlist", id: p.id })}
              className={`flex h-9 w-full items-center gap-3 rounded-vy-sm px-3 text-left text-sm transition-colors ${
                active ? "bg-fg/10 text-fg" : "text-fg-2 hover:bg-fg/5 hover:text-fg"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              {collapsed ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg/8 text-xs font-bold">{p.name.slice(0, 1).toUpperCase()}</span>
              ) : (
                <>
                  <span className="flex-1 truncate">{p.name}</span>
                  {isPlaying && <Equalizer playing={playing} />}
                </>
              )}
            </button>
          );
        })}
        {!playlists.length && !collapsed && <p className="px-3 py-2 text-xs leading-relaxed text-fg-3">Create a playlist with the + button or from any track's menu.</p>}
      </div>

      <div className="mt-3 space-y-0.5 border-t border-line pt-3">
        <button
          type="button"
          onClick={addFolders}
          title={collapsed ? "Add music folder" : undefined}
          className={`flex h-10 w-full items-center gap-3.5 rounded-vy-sm px-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-fg/5 hover:text-fg ${collapsed ? "justify-center px-0" : ""}`}
        >
          <FolderPlus size={icon} />
          {!collapsed && "Add music folder"}
        </button>
        <NavItem icon={<Settings size={icon} />} label="Settings" route={{ name: "settings" }} collapsed={collapsed} />
      </div>
    </nav>
  );
}
