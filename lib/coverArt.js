/* SPDX-License-Identifier: GPL-2.0-or-later */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';

// Loading album art and deriving a colour from it.
//
// St can only reference an image from CSS by a local file path, so remote covers
// (Spotify and friends serve https URLs) are cached to disk under a name derived
// from the URL. Each track therefore gets its own cache file and St never reuses a
// stale texture.

const CACHE_DIR_NAME = 'cadence';

// Read a cover from a file://, http(s):// or bare path into a GdkPixbuf, fully async
// so the shell never blocks on I/O. Resolves to { pixbuf, file }.
export async function loadCover(artUrl) {
    const file = artUrl.startsWith('file://') || artUrl.startsWith('http')
        ? Gio.File.new_for_uri(artUrl)
        : Gio.File.new_for_path(artUrl);

    const stream = await new Promise((resolve, reject) => {
        file.read_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try {
                resolve(source.read_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });

    const pixbuf = await new Promise((resolve, reject) => {
        GdkPixbuf.Pixbuf.new_from_stream_async(stream, null, (source, result) => {
            try {
                resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });

    return { pixbuf, file };
}

// Return a local file path St can use as a background-image. Local files are used
// as-is; remote images are written once to the cache directory.
export function localPathFor(file, pixbuf, artUrl) {
    const localPath = file.get_path();
    if (localPath) {
        return localPath;
    }

    const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), CACHE_DIR_NAME]);
    GLib.mkdir_with_parents(cacheDir, 0o755);

    const key = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, artUrl, -1);
    const cachePath = GLib.build_filenamev([cacheDir, `${key}.png`]);

    if (!GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
        pixbuf.savev(cachePath, 'png', [], []);
    }

    return cachePath;
}

// The single dominant colour of a cover: scale it to one pixel and read it back.
export function dominantColour(pixbuf) {
    const scaled = pixbuf.scale_simple(1, 1, GdkPixbuf.InterpType.BILINEAR);
    return scaled.get_pixels(); // [r, g, b]
}

// Relative luminance test, so text can be chosen light-on-dark or dark-on-light.
// https://en.wikipedia.org/wiki/Relative_luminance
export function isDark([r, g, b]) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}
