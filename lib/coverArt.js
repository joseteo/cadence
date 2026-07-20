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

// WCAG relative luminance: linearise each sRGB channel before weighting it.
// Skipping the gamma step (a plain weighted average of r/g/b) reads mid-tones as
// much brighter than the eye does, which is what makes "is this light or dark?"
// go wrong on exactly the covers where it matters.
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
export function relativeLuminance([r, g, b]) {
    const channel = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// WCAG contrast ratio between two colours, from 1 (identical) to 21 (black/white).
export function contrastRatio(a, b) {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// Alpha-composite a colour over an opaque backdrop, returning what the eye sees.
// The card is painted at background-opacity over the dock, so its apparent colour
// is never the raw cover colour: a pale cover at 50% over a dark dock still looks
// dark, and text must be picked for the blend, not the source.
export function compositeOver(colour, alpha, backdrop) {
    const a = Math.max(0, Math.min(1, alpha));
    return colour.map((c, i) => Math.round(c * a + backdrop[i] * (1 - a)));
}

// True when dark text reads better than light text on this background. Comparing
// both contrast ratios (rather than thresholding luminance) always picks the more
// legible option, including for mid-tones where a fixed threshold is a coin flip.
export function prefersDarkText(background, darkText, lightText) {
    return contrastRatio(background, darkText) >= contrastRatio(background, lightText);
}

// Nudge a tint until the card it produces clears a contrast target against the text
// that will sit on it, darkening under light text and lightening under dark text.
//
// Picking the better of black and white is not always enough: a mid-tone cover
// leaves both around 4:1, and the artist line is small enough that antialiasing
// costs it more contrast still. Moving the tint a little preserves the colour
// (the hue is untouched) while making the card readable for every cover.
export function ensureContrast(colour, alpha, backdrop, text, target) {
    const towards = relativeLuminance(text) > 0.5 ? [0, 0, 0] : [255, 255, 255];
    const shift = (k) => colour.map((c, i) => Math.round(c + (towards[i] - c) * k));

    if (contrastRatio(compositeOver(colour, alpha, backdrop), text) >= target) {
        return colour;
    }

    // Binary search the smallest shift that reaches the target, so the tint stays as
    // close to the cover as the contrast requirement allows.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(compositeOver(shift(mid), alpha, backdrop), text) >= target) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    return shift(hi);
}

// Kept for callers that just want a light/dark verdict on a colour itself.
export function isDark(colour) {
    return relativeLuminance(colour) < 0.18;
}
