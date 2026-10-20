import { Disc3 } from "lucide-react";
import { useState } from "react";
import { backend } from "../../lib/backend";

export function artUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("blob:") || path.startsWith("http")) return path;
  return backend().fileUrl(path);
}

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  rounded?: string;
  iconSize?: number;
}

/** Album art with a graceful placeholder for missing or broken images. */
export function Artwork({ src, alt = "", className = "", rounded = "rounded-vy-sm", iconSize = 28 }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = artUrl(src);
  const show = url && failed !== url;
  return (
    <div className={`relative overflow-hidden bg-elevated ${rounded} ${className}`}>
      {show ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(url)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-elevated to-hover text-fg-3">
          <Disc3 size={iconSize} strokeWidth={1.5} aria-hidden />
        </div>
      )}
    </div>
  );
}
