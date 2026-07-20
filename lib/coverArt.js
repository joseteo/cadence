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

// Size of the grid the cover is reduced to before counting colours. Small enough to
// stay cheap on the compositor thread, large enough that an accent colour occupying
// a corner of the sleeve still shows up.
const SAMPLE = 24;
// Colours are bucketed by rounding each channel, so near-identical pixels count as
// one colour rather than splitting a gradient into hundreds of singletons.
const BUCKET = 24;

// The cover's accent: the most frequent saturated colour that is not simply a
// lighter or darker version of the dominant one. Returns null for artwork that has
// no such colour (a monochrome sleeve), so callers can fall back deliberately.
export function secondaryColour(pixbuf, dominant) {
    const scaled = pixbuf.scale_simple(SAMPLE, SAMPLE, GdkPixbuf.InterpType.BILINEAR);
    const pixels = scaled.get_pixels();
    const channels = scaled.get_n_channels();
    const stride = scaled.get_rowstride();

    const counts = new Map();
    for (let y = 0; y < SAMPLE; y++) {
        for (let x = 0; x < SAMPLE; x++) {
            const i = y * stride + x * channels;
            const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
            const [, saturation, lightness] = rgbToHslLocal(rgb);
            // Near-black, near-white and unsaturated pixels carry no identity.
            if (saturation < 0.25 || lightness < 0.12 || lightness > 0.93) {
                continue;
            }
            const key = rgb.map((c) => Math.round(c / BUCKET)).join(',');
            const entry = counts.get(key);
            if (entry) {
                entry.count++;
            } else {
                counts.set(key, { rgb, count: 1 });
            }
        }
    }

    const dominantHue = rgbToHslLocal(dominant)[0];
    const ranked = [...counts.values()]
        .filter(({ rgb }) => {
            const hue = rgbToHslLocal(rgb)[0];
            const distance = Math.min(Math.abs(hue - dominantHue), 360 - Math.abs(hue - dominantHue));
            return distance >= 25;
        })
        .sort((a, b) => b.count - a.count);

    // Require the accent to hold a real share of the sleeve, so a few stray pixels
    // of a compression artefact cannot become the colour of the title.
    const threshold = SAMPLE * SAMPLE * 0.03;
    return ranked.length && ranked[0].count >= threshold ? ranked[0].rgb : null;
}

// Local HSL conversion: palette.js imports from this module, so importing it back
// would be circular. Only hue, saturation and lightness are needed here.
function rgbToHslLocal([r, g, b]) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) {
        return [0, 0, l];
    }
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) {
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
        h = ((bn - rn) / d + 2) / 6;
    } else {
        h = ((rn - gn) / d + 4) / 6;
    }
    return [h * 360, s, l];
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

// Kept for callers that just want a light/dark verdict on a colour itself.
export function isDark(colour) {
    return relativeLuminance(colour) < 0.18;
}
