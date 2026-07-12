<p align="center">
  <img src="https://raw.githubusercontent.com/joseteo/cadence/main/.github/banner.png" alt="Cadence" width="720" />
</p>

<h1 align="center">Cadence</h1>

<p align="center">
  <strong>A media player widget that lives in your GNOME dock.</strong><br>
  Track info, album art, playback controls, all without leaving your workflow.
</p>

<p align="center">
  <a href="https://extensions.gnome.org/extension/TODO/cadence/"><img src="https://img.shields.io/badge/EGO-Install-4A86CF?logo=gnome&logoColor=white" alt="Install from EGO" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--2.0--or--later-blue" alt="GPL-2.0-or-later" /></a>
  <img src="https://img.shields.io/badge/GNOME_Shell-46-green?logo=gnome&logoColor=white" alt="GNOME 46" />
</p>

---

## What it does

Cadence embeds a media card directly into your Dash to Dock (or Ubuntu Dock).
It picks up any MPRIS player (Spotify, Firefox, VLC, Rhythmbox, you name it)
and gives you at-a-glance track info plus controls without opening a window.

- **Now playing** - title, artist, and album art right in the dock
- **Playback controls** - previous, play/pause, next
- **Adaptive tint** - background colour extracted from the album cover
- **Dock-native sizing** - blends in as if it were a regular dock icon
- **Auto-hide** - disappears when nothing is playing
- **Vertical dock support** - compact layout for left/right dock positions

## Screenshots

| Horizontal dock | Vertical dock |
|:-:|:-:|
| ![Horizontal](https://raw.githubusercontent.com/joseteo/cadence/main/.github/screenshot-horizontal.png) | ![Vertical](https://raw.githubusercontent.com/joseteo/cadence/main/.github/screenshot-vertical.png) |

## Installation

### From extensions.gnome.org (recommended)

Visit the [Cadence page on EGO](https://extensions.gnome.org/extension/TODO/cadence/) and flip the toggle.

### Manual

```bash
git clone https://github.com/joseteo/cadence.git \
  ~/.local/share/gnome-shell/extensions/cadence@joseteo.github.com

cd ~/.local/share/gnome-shell/extensions/cadence@joseteo.github.com
glib-compile-schemas schemas/
```

Then restart the shell and enable:

| Session | Restart method |
|---------|---------------|
| X11 | <kbd>Alt</kbd>+<kbd>F2</kbd> > `r` > <kbd>Enter</kbd> |
| Wayland | Log out and back in |

```bash
gnome-extensions enable cadence@joseteo.github.com
```

## Configuration

Open **Extensions** > **Cadence** > **Settings**, or:

```bash
gnome-extensions prefs cadence@joseteo.github.com
```

| Setting | Description |
|---------|-------------|
| Widget width | Card width in pixels (horizontal dock) |
| Background opacity | Album-colour tint intensity |
| Tint from art | Adaptive colour vs neutral dark |
| Show artist | Display artist name under the title |
| Show controls | Display prev/play/next buttons |
| Widget position | Before or after app icons |
| Show on all monitors | One card per dock vs primary only |
| Animation duration | Expand/collapse speed |

## Requirements

- **GNOME Shell 46** (other 45+ versions may work but are untested)
- A **Dash to Dock**-based dock. Ubuntu Dock (`ubuntu-dock@ubuntu.com`) works out of the box
- Any **MPRIS-capable** media player

## How it works

Cadence watches the D-Bus session bus for MPRIS players, tracks the most
recently active one, and renders a St widget inside `dash._box`. Remote album
art (e.g. Spotify's HTTPS URLs) is cached locally so the shell's texture system
can load it. The dominant colour is extracted for the adaptive tint, with a
luminance check to ensure readable text.

## Contributing

Issues and pull requests are welcome. If you'd like to add support for another
GNOME Shell version, testing and reporting is the most valuable contribution.

## Author

**José Teo Lorente**

- [joseteo.github.io](https://joseteo.github.io)
- [github.com/joseteo](https://github.com/joseteo)

## License

[GPL-2.0-or-later](LICENSE), same family as GNOME Shell itself.
