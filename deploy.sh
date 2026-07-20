#!/usr/bin/env bash
#
# Install this working tree into the local GNOME Shell extensions directory.
#
# Intended for development: it mirrors the source into the directory GNOME loads
# extensions from, then compiles the GSettings schema so preferences work.
#
# The destination must be a real directory rather than a symlink back to this
# checkout. Installing or updating the extension from extensions.gnome.org replaces
# the contents of that directory, which through a symlink would overwrite the source.
#
# SPDX-License-Identifier: GPL-2.0-or-later

set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: ./deploy.sh [--help]

Installs the extension from this checkout into
~/.local/share/gnome-shell/extensions/<uuid>

Restart GNOME Shell afterwards to pick up JavaScript changes:
  X11      Alt+F2, then "r", then Enter
  Wayland  log out and back in
USAGE
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
fi

for cmd in rsync glib-compile-schemas; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "error: '$cmd' is required but not installed." >&2
        exit 1
    fi
done

SRC="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

# Read the uuid from metadata.json so the install path cannot drift from it.
UUID="$(sed -n 's/.*"uuid"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${SRC}/metadata.json")"
if [ -z "$UUID" ]; then
    echo "error: could not read \"uuid\" from ${SRC}/metadata.json" >&2
    exit 1
fi

# GNOME Shell loads extensions from the session's data directory. Deliberately not
# using XDG_DATA_HOME: inside a confined terminal (a snap-packaged editor, a
# container) that variable points into the sandbox, and the extension would be
# installed somewhere the shell never reads.
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

if [ -L "$DEST" ]; then
    echo "error: ${DEST} is a symlink; remove it and re-run." >&2
    exit 1
fi

# rsync --delete would empty the source if both paths resolved to the same place.
if [ -d "$DEST" ] && [ "$(cd -- "$DEST" && pwd -P)" = "$SRC" ]; then
    echo "error: source and destination are the same directory." >&2
    exit 1
fi

mkdir -p "$DEST"

# Ship only what the extension needs at runtime.
rsync -a --delete \
    --exclude '.git/' \
    --exclude '.github/' \
    --exclude '*.md' \
    --exclude '*.zip' \
    --exclude '.gitignore' \
    --exclude 'deploy.sh' \
    -- "${SRC}/" "${DEST}/"

# GNOME Shell checks extensions.gnome.org for updates and installs anything newer
# on the next restart, which would silently replace this development build with the
# published release. Declaring a high version in the installed copy only (never in
# the checkout, since extensions.gnome.org assigns the real version on upload) keeps
# the published release from ever looking newer.
sed -i 's/"version"[[:space:]]*:[[:space:]]*[0-9]\+/"version": 9999/' "${DEST}/metadata.json"

# Drop any update already staged for this uuid, which would be applied on restart.
rm -rf "${HOME}/.local/share/gnome-shell/extension-updates/${UUID}"

glib-compile-schemas "${DEST}/schemas"

echo "Installed ${UUID} to ${DEST}"
echo "Restart GNOME Shell to load JavaScript changes (Alt+F2, r, Enter on X11)."
