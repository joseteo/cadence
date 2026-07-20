/* SPDX-License-Identifier: GPL-2.0-or-later */

import { relativeLuminance, contrastRatio } from './coverArt.js';

// Choosing the colour of the text and glyphs that sit on the card.
//
// The card is a translucent tint over the dock, so the colour the eye sees is the
// composite, never the raw cover. Given that composite, the ink is picked in three
// steps, stopping at the first that produces a readable result:
//
//   1. the cover's own secondary colour, tuned to the card - the label then belongs
//      to the artwork rather than being painted on top of it;
//   2. a curated ink for the card's hue and tone, from the table below;
//   3. the same hue carried around the wheel to a harmonious angle.
//
// Every candidate is verified against the composite before it is used, and its
// lightness is walked outwards until it clears the target, so readability never
// depends on the artwork being well behaved. Contrast comes from the colour itself,
// which is why the labels need no shadow.

// Readability target. Above the 4.5:1 WCAG minimum because the artist line is small
// and thin, and antialiasing costs a thin glyph a good part of its nominal ratio.
export const INK_TARGET = 7;
const ARTIST_TARGET = 6;
// The floor every ink must clear, whatever the artwork does.
const WCAG_MINIMUM = 4.5;

// ---- colour space ----

export function rgbToHsl([r, g, b]) {
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

export function hslToRgb([h, s, l]) {
    const hn = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
        let tn = t;
        if (tn < 0) tn += 1;
        if (tn > 1) tn -= 1;
        if (tn < 1 / 6) return p + (q - p) * 6 * tn;
        if (tn < 1 / 2) return q;
        if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
        return p;
    };
    return [
        Math.round(channel(hn + 1 / 3) * 255),
        Math.round(channel(hn) * 255),
        Math.round(channel(hn - 1 / 3) * 255),
    ];
}

export function toCss([r, g, b]) {
    return `rgb(${r}, ${g}, ${b})`;
}

// ---- the ink table ----

// One entry per 30 degrees of hue. `onDark` is the ink for a dark card, `onLight`
// for a light one, both as [hue, saturation, lightness].
//
// The hues are deliberately not the card's own: a tint of the exact same hue reads
// as a faded version of the background, while a small rotation (warm reds carry a
// touch of amber, blues cool towards cyan) keeps the ink related to the artwork but
// clearly separate from it. Saturation stays low so the colour reads as "white with
// a temperature" rather than as coloured text, which is what makes it look like part
// of the artwork instead of a highlighter.
export const INK_TABLE = [
    { hue: 0,   onDark: [18, 0.55, 0.94], onLight: [356, 0.62, 0.16] }, // red
    { hue: 30,  onDark: [38, 0.60, 0.93], onLight: [22, 0.70, 0.15] },  // orange
    { hue: 60,  onDark: [52, 0.55, 0.92], onLight: [45, 0.75, 0.14] },  // yellow
    { hue: 90,  onDark: [78, 0.40, 0.93], onLight: [95, 0.55, 0.13] },  // lime
    { hue: 120, onDark: [140, 0.35, 0.94], onLight: [135, 0.55, 0.13] }, // green
    { hue: 150, onDark: [160, 0.35, 0.94], onLight: [165, 0.55, 0.13] }, // spring
    { hue: 180, onDark: [186, 0.38, 0.94], onLight: [190, 0.60, 0.14] }, // cyan
    { hue: 210, onDark: [204, 0.42, 0.95], onLight: [212, 0.62, 0.15] }, // azure
    { hue: 240, onDark: [228, 0.40, 0.95], onLight: [235, 0.55, 0.17] }, // blue
    { hue: 270, onDark: [268, 0.35, 0.95], onLight: [270, 0.50, 0.17] }, // violet
    { hue: 300, onDark: [304, 0.35, 0.95], onLight: [305, 0.52, 0.16] }, // magenta
    { hue: 330, onDark: [340, 0.45, 0.94], onLight: [338, 0.58, 0.16] }, // rose
];

// A card with almost no saturation gets a neutral ink with a hint of warmth, so it
// reads as considered rather than as a default grey.
const NEUTRAL_INK = { onDark: [40, 0.10, 0.96], onLight: [220, 0.12, 0.12] };
const NEUTRAL_SATURATION = 0.08;

function tableEntryFor(hue) {
    let best = INK_TABLE[0];
    let bestDistance = 360;
    for (const entry of INK_TABLE) {
        const d = Math.min(Math.abs(entry.hue - hue), 360 - Math.abs(entry.hue - hue));
        if (d < bestDistance) {
            bestDistance = d;
            best = entry;
        }
    }
    return best;
}

// ---- picking the ink ----

// Which way the ink has to go. Decided by comparing what each extreme can actually
// achieve against this card rather than by thresholding its luminance: a mid-tone
// card is far from both ends, and the naive test sends it towards the ceiling it is
// closest to, which is exactly the direction with the least room left.
export function wantsLightInk(card) {
    return contrastRatio(card, [255, 255, 255]) >= contrastRatio(card, [0, 0, 0]);
}

// Walk a colour's lightness away from the card until it clears the target, keeping
// hue and saturation so the result stays the colour that was chosen, only lighter or
// darker. Tries the promising direction first, then the other one, because a mid
// card can be reachable from one end only. Returns null when neither works.
function reachTarget(hsl, card, target) {
    const [h, s, l] = hsl;

    const walk = (step) => {
        for (let i = 0, lightness = l; i <= 50; i++, lightness += step) {
            const clamped = Math.min(1, Math.max(0, lightness));
            const rgb = hslToRgb([h, s, clamped]);
            if (contrastRatio(rgb, card) >= target) {
                return rgb;
            }
            if (clamped === 0 || clamped === 1) {
                return null;
            }
        }
        return null;
    };

    const first = wantsLightInk(card) ? 0.02 : -0.02;
    return walk(first) ?? walk(-first);
}

// The cover's secondary colour, if it is distinct enough from the card to be worth
// using and can be made readable against it.
function inkFromSecondary(secondary, card, target) {
    if (!secondary) {
        return null;
    }

    const [h, s] = rgbToHsl(secondary);
    // A washed-out secondary carries no identity, and using it would look accidental.
    if (s < 0.18) {
        return null;
    }

    const [cardHue, cardSaturation] = rgbToHsl(card);
    const hueDistance = Math.min(Math.abs(h - cardHue), 360 - Math.abs(h - cardHue));
    // Too close to the card's own hue reads as a faded background, not as ink - but
    // only when the card has a hue to clash with. A near-neutral card competes with
    // nothing, so the accent is free to carry the artwork's colour.
    if (cardSaturation > NEUTRAL_SATURATION * 2 && hueDistance < 25) {
        return null;
    }

    // Keep the hue, lift the saturation slightly so it survives being made very light
    // or very dark, then walk it to the target.
    return reachTarget([h, Math.min(0.7, s + 0.1), rgbToHsl(secondary)[2]], card, target);
}

// The curated ink for the card's hue and tone.
function inkFromTable(card, target) {
    const [hue, saturation] = rgbToHsl(card);
    const entry = saturation < NEUTRAL_SATURATION ? NEUTRAL_INK : tableEntryFor(hue);
    return reachTarget(wantsLightInk(card) ? entry.onDark : entry.onLight, card, target);
}

// Last resort: the card's own hue carried a third of the way around the wheel, which
// is far enough to separate cleanly at any tone.
function inkFromWheel(card, target) {
    const [hue, saturation] = rgbToHsl(card);
    return reachTarget(
        [hue + 120, Math.max(0.25, Math.min(0.5, saturation)), wantsLightInk(card) ? 0.95 : 0.12],
        card,
        target
    );
}

// The ink for a card: the cover's secondary colour when it works, otherwise the
// curated table, otherwise the wheel. Always verified against the card.
export function inkFor(card, secondary = null, target = INK_TARGET) {
    // A vivid mid-tone card cannot reach the preferred target from either end. Rather
    // than dropping straight to black or white, aim high, then settle for the WCAG
    // floor, so a colour is kept wherever one is possible at all.
    for (const aim of [target, WCAG_MINIMUM]) {
        const ink = inkFromSecondary(secondary, card, aim)
            ?? inkFromTable(card, aim)
            ?? inkFromWheel(card, aim);
        if (ink) {
            return ink;
        }
    }
    // Only reached by a card no colour can sit on legibly; take the more readable
    // extreme. Readability outranks the palette.
    return wantsLightInk(card) ? [255, 255, 255] : [0, 0, 0];
}

// The artist line is secondary information, so it is allowed to sit a little softer
// than the title - but only by tone, never by dropping below its own target.
export function secondaryInkFor(card, primaryInk) {
    const [h, s, l] = rgbToHsl(primaryInk);
    const softened = [h, s, wantsLightInk(card) ? Math.max(0, l - 0.08) : Math.min(1, l + 0.08)];
    return reachTarget(softened, card, ARTIST_TARGET) ?? primaryInk;
}
