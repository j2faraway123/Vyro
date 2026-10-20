import { FileAudio, FolderPlus, Music2 } from "lucide-react";
import { Button, Spinner } from "../components/common/controls";
import { EmptyState, ErrorBanner } from "../components/common/EmptyState";
import { backend } from "../lib/backend";
import { useLibrary } from "../store/library";

export function ImportActions() {
  const { addFolders, importFiles } = useLibrary();
  return (
    <>
      <Button variant="primary" icon={<FolderPlus size={16} />} onClick={addFolders}>
        Add music folder
      </Button>
      <Button icon={<FileAudio size={16} />} onClick={() => importFiles()}>
        Import files
      </Button>
    </>
  );
}

export function EmptyLibrary() {
  const preview = backend().isPreview;
  return (
    <EmptyState icon={<Music2 size={28} />} title="Your library is empty" actions={preview ? undefined : <ImportActions />}>
      {preview
        ? "The browser preview can't read files on your computer. Run the desktop app to import your music."
        : "Add a folder of music (MP3, FLAC, WAV, M4A, AAC, Ogg, Opus) or drag files and folders anywhere into this window. Vyro reads tags and artwork and keeps everything in a local database."}
    </EmptyState>
  );
}

/** Wraps a page that needs the library: loading, error and empty states. */
export function LibraryGate({ children, allowEmpty }: { children: React.ReactNode; allowEmpty?: boolean }) {
  const { loaded, loadError, tracks, refresh } = useLibrary();
  if (!loaded)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={26} />
      </div>
    );
  if (loadError)
    return (
      <ErrorBanner action={<Button onClick={refresh}>Retry</Button>}>
        <strong>Couldn't load your library.</strong> {loadError}
      </ErrorBanner>
    );
  if (!tracks.length && !allowEmpty) return <EmptyLibrary />;
  return <>{children}</>;
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-6 px-3">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">{children}</h1>
      {sub && <p className="mt-1 text-sm text-fg-2">{sub}</p>}
    </div>
  );
}

export function Dot() {
  return <span aria-hidden>·</span>;
}
