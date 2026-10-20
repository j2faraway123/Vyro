# Vyro community themes

A Vyro theme is a single JSON file. You can export your current look from
**Settings → Appearance → Export current**, edit it in any text editor, and share
it. Anyone can install it with **Settings → Appearance → Import JSON**.
Imported themes are stored in Vyro's local database, so the original file is
not needed after import.

A complete example lives in [`example-theme.json`](example-theme.json). The test
suite validates that file on every run.

## Format (version 1)

```json
{
  "format": "vyro-theme",
  "formatVersion": 1,
  "id": "night-drive",
  "name": "Night Drive",
  "author": "Your name",
  "description": "Deep indigo panels with a violet accent",
  "version": "1.0.0",
  "mode": "dark",
  "colors": {
    "background": "#0f0f1a",
    "panel": "#17172a",
    "elevated": "#20203a",
    "textPrimary": "#f2f0ff",
    "textSecondary": "#a3a0c2",
    "accent": "#8b6cff"
  },
  "radius": 18,
  "density": "comfortable",
  "background": { "source": "album", "blur": 100, "brightness": 0.55 },
  "css": ".vy-lyric.active { letter-spacing: 0.01em; }"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `format` | yes | Must be `"vyro-theme"`. |
| `formatVersion` | yes | A number no greater than `1`. Newer versions are rejected with a clear message rather than half-applied. |
| `name` | yes | Up to 64 characters. |
| `id` | no | Turned into a slug (`a-z`, `0-9`, `-`, up to 48 characters). Defaults to the slug of `name`. An id that matches a built-in theme gets `-custom` appended. Importing a theme with the same id as an installed one replaces it. |
| `author`, `description`, `version` | no | Plain text, trimmed to 64, 200 and 16 characters. |
| `mode` | yes | `"dark"` or `"light"`. This picks the readable text band for album-reactive backgrounds and the light or dark variants of status colours. |
| `colors.background` | yes | Window background behind the panels, as a hex colour like `#171717`. |
| `colors.panel` | yes | Sidebar, main area, now-playing panel and playback bar. |
| `colors.elevated` | yes | Cards, inputs, menus and dialogs. |
| `colors.textPrimary` | yes | Titles and body text. |
| `colors.textSecondary` | yes | Secondary text. A third, dimmer text tone is mixed from these two automatically. |
| `colors.accent` | yes | Buttons, progress and highlights. When *Dynamic album colours* is on, the artwork tints this at playback time. |
| `colors.border` | no | Any CSS colour. Defaults to a translucent mix of the text colour. |
| `radius` | no | Corner radius in px, from `0` to `32`. |
| `density` | no | `"comfortable"` or `"compact"`. |
| `background` | no | Background defaults for this theme (see below). |
| `css` | no | Extra CSS, up to 100 KB. Sanitised on import (see below). |

Unknown keys are dropped on import. When a theme fails validation, Vyro lists
every problem it found and installs nothing.

### `background`

`background` may contain any of these keys from the background settings. Values
are clamped to the ranges shown, and anything else is ignored.

| Key | Values |
| --- | --- |
| `source` | `"album"` (follow the playing track's artwork) or `"manual"` |
| `manual` | `"preset"`, `"static"`, `"gradient"` or `"image"` |
| `preset` | `"aurora"`, `"sunset"`, `"ocean"`, `"midnight"`, `"ambient"` |
| `staticColor` | hex colour |
| `gradient` | `{ "from": hex, "via": hex, "to": hex, "angle": 0-360 }` |
| `dynamicAccent`, `animated` | `true` / `false` |
| `effects` | `{ "colorFields", "blurredArt", "lightWaves", "particles", "parallax" }`, each `true` / `false` |
| `blur` | 0-140 (px) |
| `brightness` | 0.2-1 |
| `speed` | 0.25-3 |
| `intensity` | 0-1 |
| `opacity` | 0-1 |
| `reducedMotion` | `"system"`, `"on"`, `"off"` |
| `performanceMode` | `true` / `false` |

`imagePath` is never imported. A file path from someone else's computer would
be meaningless on yours, so a theme cannot point at an image.

### `css`

Extra CSS is applied after the theme variables. Before it is applied, Vyro
removes `@import`, `url()` pointing at `http:`, `https:`, `//` or
`javascript:`, `expression(` and any `</style>`. Themes therefore can't load
remote resources or track who uses them. Local `data:` URLs are kept.

Useful hooks include the variables `--vy-bg`, `--vy-panel`, `--vy-elevated`,
`--vy-text`, `--vy-text-2`, `--vy-text-3`, `--vy-border`, `--vy-accent` (the
live accent, including album tinting), `--vy-radius` and `--vy-row`, and the classes `.vy-panel`, `.vy-elevated`, `.vy-lyric` and
`.vy-lyric.active`. Class names aren't a stable API yet. Prefer the
variables, and expect selectors to need updates between Vyro versions.

## Tips

- Check contrast. `textSecondary` on `panel` should reach at least 4.5:1
  (WCAG AA) for body text.
- Build light themes with `"mode": "light"`. Album-reactive backgrounds then
  use a light band that keeps dark text readable.
- Your accent, radius and density tweaks in Settings sit on top of the theme.
  Export again to bake them in.
