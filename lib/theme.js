/* SPDX-License-Identifier: GPL-2.0-or-later */

// Style-class names used across the widget, and the colour palette the card falls
// back to. Keeping the names here (rather than as string literals scattered through
// the code) means the CSS in stylesheet.css and the actors always agree.

export const StyleClass = {
    Card: 'cadence-card',
    Row: 'cadence-row',
    Meta: 'cadence-meta',
    Title: 'cadence-title',
    MetaBottom: 'cadence-meta-bottom',
    Artist: 'cadence-artist',
    Controls: 'cadence-controls',
    Previous: 'cadence-prev',
    PlayPause: 'cadence-play',
    Next: 'cadence-next',
    Art: 'cadence-art',
    Column: 'cadence-column',
    Overlay: 'cadence-overlay',
    Vertical: 'cadence-vertical',
};

export const Palette = {
    // Text over a light cover / over a dark cover.
    TitleOnDark: 'white',
    TitleOnLight: 'black',
    ArtistOnDark: '#cccccc',
    ArtistOnLight: '#333333',
    // Neutral card background when there is no art or the tint is switched off.
    Neutral: 'rgba(30, 30, 30, 0.7)',
    NeutralRgb: [30, 30, 30],
    NeutralAlpha: 0.7,
};

// The card is translucent, so what the user actually sees is the tint blended with
// the dock behind it. The dock's own background is dark in both the default Adwaita
// and Ubuntu themes; approximating it as near-black is what lets the text colour be
// chosen from the blended result rather than the raw cover colour.
export const DockBackdrop = [24, 24, 24];

// Pure black/white as RGB, for contrast maths against the two text palettes.
export const TextRgb = {
    Dark: [0, 0, 0],
    Light: [255, 255, 255],
};

export const Icon = {
    Play: 'media-playback-start-symbolic',
    Pause: 'media-playback-pause-symbolic',
    Previous: 'media-skip-backward-symbolic',
    Next: 'media-skip-forward-symbolic',
    NoArt: 'audio-x-generic-symbolic',
};
