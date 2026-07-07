/* SPDX-License-Identifier: GPL-2.0-or-later */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import { StyleClass, Palette, Icon } from './theme.js';
import * as CoverArt from './coverArt.js';

const TITLE_FALLBACK = 'Unknown Title';
const ARTIST_FALLBACK = 'Unknown Artist';

// The card mirrors the dock's app-icon hover background (.overview-icon): the album
// art is exactly the icon size, wrapped in this much padding, so the card occupies
// the same footprint as a hovered app icon and blends into the dock. Must match the
// padding in stylesheet.css (the dock theme uses 6px padding, 16px radius).
const CARD_PADDING = 6;
const MIN_ART_SIZE = 16;
// In a vertical dock the card becomes a one-icon-wide column of prev / art / next;
// the two skip buttons contribute their own height on top of the art.
const SKIP_BUTTON_SIZE = 34;
const COLUMN_SPACING = 4;

const DEFAULT_WIDTH = 280;
const DEFAULT_DURATION = 300;
const DEFAULT_OPACITY = 0.5;

const EXPANDED = 'expanded';
const COLLAPSED = 'collapsed';

export const TrackCard = GObject.registerClass(
class TrackCard extends St.BoxLayout {
    _init(settings = null) {
        super._init({
            style_class: StyleClass.Card,
            vertical: true,
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._settings = settings;
        this._settingIds = [];
        this._lastArtUrl = null;
        this._lastColour = null;
        // Vertical docks use the compact column layout; see setVertical().
        this._vertical = false;
        // Non-zero default so a compact expand that races the icon-size callback still
        // has a visible width; refined by setIconSize().
        this._columnWidth = 64;

        this._build();
        this._assemble();
        this._wireButtons();
        this._connectSettings();
    }

    // ---- settings ----

    _connectSettings() {
        if (!this._settings) {
            return;
        }

        const watch = (key, handler) => {
            handler();
            this._settingIds.push(this._settings.connect(`changed::${key}`, handler));
        };

        watch('show-artist', () => this._applyShowArtist());
        watch('show-controls', () => this._applyShowControls());
        watch('widget-width', () => {
            // Width is user-configurable only for the horizontal card; the vertical
            // column is a fixed one-icon width.
            if (this._state === COLLAPSED || this._vertical) {
                return;
            }
            this.remove_all_transitions();
            this.ease({
                width: this._width(),
                duration: this._duration(),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
        watch('background-opacity', () => {
            if (this._lastColour) {
                this._applyBackground(this._lastColour);
            }
        });
        watch('tint-from-art', () => {
            if (this._lastColour) {
                this._applyColours(this._lastColour);
            }
        });
    }

    disconnectSettings() {
        if (!this._settings) {
            return;
        }
        for (const id of this._settingIds) {
            this._settings.disconnect(id);
        }
        this._settingIds = [];
    }

    _int(key, fallback) {
        return this._settings ? this._settings.get_int(key) : fallback;
    }

    _bool(key, fallback) {
        return this._settings ? this._settings.get_boolean(key) : fallback;
    }

    _width() {
        return this._int('widget-width', DEFAULT_WIDTH);
    }

    _duration() {
        return this._int('animation-duration', DEFAULT_DURATION);
    }

    _opacity() {
        return this._settings ? this._settings.get_double('background-opacity') : DEFAULT_OPACITY;
    }

    _tintFromArt() {
        return this._bool('tint-from-art', true);
    }

    _applyShowArtist() {
        this._bool('show-artist', true) ? this._artist.show() : this._artist.hide();
    }

    _applyShowControls() {
        this._bool('show-controls', true) ? this._controls.show() : this._controls.hide();
    }

    // ---- controller wiring ----

    setController(controller) {
        this._controller = controller;
    }

    // ---- sizing ----

    // The album art is exactly the dock's app-icon size in both orientations, so with
    // CARD_PADDING around it the tinted card equals the app-icon hover background and
    // reads as one more dock item. In a vertical dock that also makes it exactly one
    // icon-slot wide, so it never overflows the narrow column.
    setIconSize(iconSize) {
        const artSize = Math.max(iconSize, MIN_ART_SIZE);
        this._art.set_size(artSize, artSize);

        if (this._vertical) {
            this._columnWidth = artSize + 2 * CARD_PADDING;
            this.set_width(this._columnWidth);
        }
    }

    // Called once at attach time with the dock's orientation. A vertical dock is only
    // about one icon wide, so the horizontal card cannot fit; the card becomes a
    // column of skip-previous / album art (which doubles as play/pause, with a glyph
    // overlaid) / skip-next.
    setVertical(vertical) {
        this._vertical = vertical;
        if (vertical) {
            this._buildColumn();
        }
    }

    _buildColumn() {
        this.add_style_class_name(StyleClass.Vertical);
        // Expand across the column but render at natural (card) width, centred, so the
        // tinted card lines up on the same axis as the app icons and never overflows
        // the dock edge.
        this.set_x_expand(true);
        this.set_x_align(Clutter.ActorAlign.CENTER);

        this._detach(this._art);
        this._detach(this._prevButton);
        this._detach(this._nextButton);
        this._detach(this._row);

        this._column = new St.BoxLayout({
            style_class: StyleClass.Column,
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Keep the skip buttons at their natural square size and centred so their round
        // hover background stays a circle instead of stretching into a wide pill.
        for (const button of [this._prevButton, this._nextButton]) {
            button.set_x_expand(false);
            button.set_x_align(Clutter.ActorAlign.CENTER);
        }

        this._column.add_child(this._prevButton);
        this._column.add_child(this._art);
        this._column.add_child(this._nextButton);
        this.add_child(this._column);

        // The art is the play/pause button and carries the glyph overlay. track_hover
        // drives the :hover style so the tile reacts to the pointer.
        this._art.reactive = true;
        this._art.track_hover = true;
        this._art.set_child(this._overlay);

        this.set_width(this._columnWidth);
    }

    _detach(actor) {
        const parent = actor.get_parent();
        if (parent) {
            parent.remove_child(actor);
        }
    }

    // ---- construction ----

    _build() {
        this._row = new St.BoxLayout({
            style_class: StyleClass.Row,
            vertical: false,
            x_expand: false,
            y_expand: false,
            clip_to_allocation: true,
        });

        // The metadata column: title on top, artist (bottom row) below.
        this._meta = new St.BoxLayout({
            style_class: StyleClass.Meta,
            vertical: true,
            x_expand: true,
            y_expand: true,
        });

        this._title = new St.Label({
            style_class: StyleClass.Title,
            text: TITLE_FALLBACK,
            y_align: Clutter.ActorAlign.START,
            y_expand: true,
            x_expand: false,
        });
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        // Collapse newlines to one line: MPRIS metadata may contain them and a
        // multi-line label would grow the card past the dock's height budget.
        this._title.clutter_text.single_line_mode = true;

        this._metaBottom = new St.BoxLayout({
            style_class: StyleClass.MetaBottom,
            vertical: false,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        });

        this._artist = new St.Label({
            style_class: StyleClass.Artist,
            text: ARTIST_FALLBACK,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._artist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artist.clutter_text.single_line_mode = true;

        this._controls = new St.BoxLayout({
            style_class: StyleClass.Controls,
            vertical: false,
            x_expand: false,
            x_align: Clutter.ActorAlign.END,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._prevButton = new St.Button({ style_class: StyleClass.Previous, y_align: Clutter.ActorAlign.CENTER });
        this._playButton = new St.Button({ style_class: StyleClass.PlayPause, y_align: Clutter.ActorAlign.CENTER });
        this._nextButton = new St.Button({ style_class: StyleClass.Next, y_align: Clutter.ActorAlign.CENTER });

        this._playIcon = new St.Icon({ icon_name: Icon.Play, y_align: Clutter.ActorAlign.CENTER });
        this._pauseIcon = new St.Icon({ icon_name: Icon.Pause, y_align: Clutter.ActorAlign.CENTER });
        this._prevIcon = new St.Icon({ icon_name: Icon.Previous, y_align: Clutter.ActorAlign.CENTER });
        this._nextIcon = new St.Icon({ icon_name: Icon.Next, y_align: Clutter.ActorAlign.CENTER });

        this._art = new St.Bin({
            style_class: StyleClass.Art,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
        });
        // In the vertical column the art doubles as the play/pause button. The action
        // is added here and is harmless while the art is inert (horizontal dock).
        this._artClick = new Clutter.ClickAction();
        this._artClick.connect('clicked', () => this._controller?.toggle());
        this._art.add_action(this._artClick);

        // Play/pause glyph shown over the art in the vertical column.
        this._overlay = new St.Icon({
            style_class: StyleClass.Overlay,
            icon_name: Icon.Pause,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._fallbackIcon = new St.Icon({ icon_name: Icon.NoArt, y_align: Clutter.ActorAlign.CENTER });
    }

    _assemble() {
        this._metaBottom.add_child(this._artist);

        this._meta.add_child(this._title);
        this._meta.add_child(this._metaBottom);

        this._controls.add_child(this._prevButton);
        this._controls.add_child(this._playButton);
        this._controls.add_child(this._nextButton);

        this._prevButton.set_child(this._prevIcon);
        this._playButton.set_child(this._playIcon);
        this._nextButton.set_child(this._nextIcon);

        // Fallback icon by default; replaced once real art loads.
        this._art.set_child(this._fallbackIcon);

        // Horizontal layout: art | metadata | controls. The controls get their own
        // full-height column beside the title rather than sitting under it, because
        // stacking them adds their height to the title's and the card would outgrow the
        // dock's height budget.
        this._row.add_child(this._art);
        this._row.add_child(this._meta);
        this._row.add_child(this._controls);

        this.add_child(this._row);
    }

    _wireButtons() {
        this._playButton.connect('clicked', () => this._controller?.toggle());
        this._nextButton.connect('clicked', () => this._controller?.next());
        this._prevButton.connect('clicked', () => this._controller?.previous());
    }

    // ---- content updates ----

    update(track, status) {
        this._title.set_text(String(track.title || TITLE_FALLBACK));
        this._artist.set_text(String(track.artist || ARTIST_FALLBACK));

        // Only reload art when the URL changes, to avoid needless fetches.
        if (track.artUrl && track.artUrl !== this._lastArtUrl) {
            this._lastArtUrl = track.artUrl;
            this._loadArt(track.artUrl).catch((err) => {
                logError(err, 'Cadence: failed to load album art');
                this._useFallback();
            });
        } else if (!track.artUrl) {
            this._lastArtUrl = null;
            this._useFallback();
        }

        this._updatePlayGlyph(status);
    }

    _updatePlayGlyph(status) {
        const playing = status === 'Playing';
        this._playButton.set_child(playing ? this._pauseIcon : this._playIcon);
        // The vertical column shows the glyph over the art instead of a button.
        this._overlay.icon_name = playing ? Icon.Pause : Icon.Play;
    }

    async _loadArt(artUrl) {
        try {
            const { pixbuf, file } = await CoverArt.loadCover(artUrl);

            // A child St.Icon would paint over the parent's rounded background and
            // square off the corners; St clips a background-image to the border radius
            // instead. In the vertical column the play/pause glyph sits over the art.
            this._art.set_child(this._vertical ? this._overlay : null);
            this._art.set_style(
                `background-image: url("${CoverArt.localPathFor(file, pixbuf, artUrl)}"); background-size: cover;`
            );

            this._colourFromArt(pixbuf);
        } catch (e) {
            logError(e, `Cadence: failed to load cover from ${artUrl}`);
            this._useFallback();
        }
    }

    // ---- colours ----

    _colourFromArt(pixbuf) {
        this._lastColour = CoverArt.dominantColour(pixbuf);
        this._applyColours(this._lastColour);
    }

    // Sets both the card background and the label colours from a stored dominant
    // colour, honouring the tint-from-art setting. Re-run when that toggles.
    _applyColours(colour) {
        this._applyBackground(colour);

        if (!this._tintFromArt()) {
            this._setTextColour(this._title, Palette.TitleOnDark);
            this._setTextColour(this._artist, Palette.ArtistOnDark);
            return;
        }

        const dark = CoverArt.isDark(colour);
        this._setTextColour(this._title, dark ? Palette.TitleOnDark : Palette.TitleOnLight);
        this._setTextColour(this._artist, dark ? Palette.ArtistOnDark : Palette.ArtistOnLight);
    }

    _applyBackground(colour) {
        if (!this._tintFromArt()) {
            this.set_style(`background-color: ${Palette.Neutral};`);
            return;
        }
        const opacity = this._opacity();
        this.set_style(`background-color: rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${opacity.toFixed(2)});`);
    }

    _setTextColour(label, colour) {
        label.set_style(`color: ${colour};`);
    }

    _useFallback() {
        this._lastColour = null;
        this.set_style(`background-color: ${Palette.Neutral};`);
        this._setTextColour(this._title, Palette.TitleOnDark);
        this._setTextColour(this._artist, Palette.ArtistOnDark);
        // Drop any leftover background-image before showing the generic icon.
        this._art.set_style('');
        this._art.set_child(this._fallbackIcon);
    }

    // ---- show / hide animation ----

    expand() {
        if (this._state === EXPANDED) {
            return;
        }
        this.show();
        this._state = EXPANDED;
        this.remove_all_transitions();
        this.set_opacity(0);

        const params = {
            opacity: 255,
            duration: this._duration(),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        };

        // The vertical column just fades in at its natural (content) height; animating
        // a computed height clipped the prev/next buttons. The horizontal card grows
        // its width from zero.
        if (this._vertical) {
            this.set_height(-1);
        } else {
            this.set_width(0);
            params.width = this._width();
        }

        this.ease(params);
    }

    // Collapse and run the callback when done. The callback still runs immediately when
    // already collapsed, because callers (teardown) depend on it.
    collapse(callback) {
        if (this._state === COLLAPSED) {
            callback?.();
            return;
        }
        this._state = COLLAPSED;
        this.remove_all_transitions();

        const params = {
            opacity: 0,
            duration: this._duration(),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._state === COLLAPSED) {
                    this.hide();
                }
                callback?.();
            },
        };

        // Horizontal shrinks its width to zero; the vertical column just fades out (a
        // hidden actor takes no space, so the dock closes the gap either way).
        if (!this._vertical) {
            params.width = 0;
        }

        this.ease(params);
    }
});
