# Cadence

A media player widget embedded directly into your GNOME dock. It shows the
current track, album art and playback controls, and tints itself to match the
dominant colour of the cover.

## Features
- **Playback controls** — play/pause, previous and next, right in the dock
- **Track info** — current title and artist
- **Adaptive colour** — the widget background follows the album art's dominant colour
- **Adaptive layout** — expands and shrinks with the track and artist length
- **Adaptive visibility** — hides itself when nothing is playing

## Requirements
- GNOME Shell 45–50 (verified on **46, X11**)
- A **Dash to Dock**-based dock. Ubuntu's bundled `ubuntu-dock@ubuntu.com` works —
  it is a Dash to Dock fork and exposes the same `dashtodockContainer` actor the
  widget attaches to.
- Any MPRIS-capable player (Spotify, VLC, Rhythmbox, browsers, …)

## Installation (manual)

```bash
git clone <this-repo> ~/.local/share/gnome-shell/extensions/cadence@joseteo.github.com
glib-compile-schemas ~/.local/share/gnome-shell/extensions/cadence@joseteo.github.com/schemas/
```

Restart GNOME Shell, then enable:

- **X11**: `Alt+F2`, type `r`, `Enter`
- **Wayland**: log out and back in

```bash
gnome-extensions enable cadence@joseteo.github.com
```

## Development notes

- **GNOME Shell caches extension JavaScript.** `gnome-extensions disable && enable`
  reloads `stylesheet.css` but keeps the previously imported JS modules, so JS edits
  appear to do nothing — a full shell restart is required to pick them up.
- **The widget must fit an icon's height.** The dock sizes itself to its tallest
  child; a taller widget makes Dash to Dock shrink every icon and lifts the running
  indicators. Controls sit in their own column (not stacked under the title) and the
  art is a fraction of the icon size to keep the card short. See `MediaWidget.js`.
- **Concentric radii**: the card's radius must equal the art's radius plus the gap
  around it. See the comments in `stylesheet.css`.
- Remote album art (Spotify serves `https://` URLs) is cached under
  `~/.cache/cadence/`, because St can only reference art from CSS by local path.

## Author & licence

Cadence is created by **José Teo Lorente** — [joseteo.github.io](https://joseteo.github.io).

Licensed under **GPL-2.0-or-later** — see [LICENSE](LICENSE).
