/* SPDX-License-Identifier: GPL-2.0-or-later */

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { TrackCard } from './trackCard.js';
import { PlaybackStatus } from './playerWatcher.js';

// Owns the track cards. It finds the Dash to Dock docks, decides which monitors
// should carry a card (primary only, or all), builds one card per dock, keeps them
// attached as docks come and go, and pushes the watcher's state to every card.

const DOCK_NAME = 'dashtodockContainer';
const DOCK_CLASS = 'DashToDock';

export class DockManager {
    // controller exposes toggle()/next()/previous() and is handed to each card.
    constructor(settings, controller) {
        this._settings = settings;
        this._controller = controller;
        this._cards = new Map();          // dock actor -> TrackCard
        // Last state from the watcher, replayed onto cards as they are created.
        this._state = { busName: null, status: PlaybackStatus.Stopped, track: null };
    }

    start() {
        // Docks can appear and disappear (monitors connect, Dash to Dock reloads).
        Main.uiGroup.connectObject(
            'child-added', (_g, actor) => {
                if (this._isDock(actor)) {
                    this._sync();
                }
            },
            'child-removed', (_g, actor) => {
                if (this._cards.has(actor)) {
                    this._dropCard(actor);
                }
            },
            this
        );

        this._settings.connectObject(
            'changed::show-on-all-monitors', () => this._sync(),
            'changed::widget-position', () => this._reinsertAll(),
            this
        );

        this._sync();
    }

    // Push a new player state onto every card.
    onChange(busName, status, track) {
        this._state = { busName, status, track };
        for (const card of this._cards.values()) {
            this._applyState(card);
        }
    }

    _applyState(card) {
        const { status, track } = this._state;
        if ((status === PlaybackStatus.Playing || status === PlaybackStatus.Paused) && track) {
            card.expand();
            card.update(track, status);
        } else {
            card.collapse(() => {});
        }
    }

    // Reconcile the set of cards with the set of docks we should be on.
    _sync() {
        const targets = this._targetDocks();

        // Remove cards whose dock is gone or no longer targeted.
        for (const dock of [...this._cards.keys()]) {
            if (!targets.includes(dock)) {
                this._dropCard(dock);
            }
        }

        // Add cards for newly-targeted docks.
        for (const dock of targets) {
            if (!this._cards.has(dock)) {
                this._addCard(dock);
            }
        }
    }

    _targetDocks() {
        const docks = Main.uiGroup.get_children().filter((a) => this._isDock(a));
        if (this._settings.get_boolean('show-on-all-monitors')) {
            return docks;
        }
        const primary = Main.layoutManager.primaryIndex;
        const onPrimary = docks.filter((d) => d.monitorIndex === primary);
        // Fall back to whatever exists if the monitor index is unavailable.
        return onPrimary.length ? onPrimary : docks.slice(0, 1);
    }

    _addCard(dock) {
        const dash = dock.dash;
        const vertical = this._isVertical(dock, dash);

        const card = new TrackCard(this._settings);
        card.setController(this._controller);
        card.setVertical(vertical);

        this._cards.set(dock, card);
        this._insert(dock, card);

        // The dash reports its icon size a little after attach; size the art then.
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._cards.get(dock) === card) {
                card.setIconSize(dash.iconSize ?? 32);
            }
            return GLib.SOURCE_REMOVE;
        });

        // Vertical dock: expand across the column width so the card centres on the app
        // icon axis. Horizontal dock: take the card's own width in the row.
        card.set_y_expand(false);
        card.set_x_expand(vertical);
        card.collapse(() => {});

        // Replay the current player state so a card created mid-playback shows it.
        this._applyState(card);
    }

    _insert(dock, card) {
        const box = dock.dash?._box;
        if (!box) {
            return;
        }
        if (card.get_parent() === box) {
            box.remove_child(card);
        }
        if (this._settings.get_string('widget-position') === 'start') {
            box.insert_child_at_index(card, 0);
        } else {
            box.add_child(card);
        }
    }

    _reinsertAll() {
        for (const [dock, card] of this._cards) {
            this._insert(dock, card);
        }
    }

    _dropCard(dock) {
        const card = this._cards.get(dock);
        this._cards.delete(dock);
        if (!card) {
            return;
        }
        // The card may already be disposed if its dock was destroyed; guard the whole
        // teardown since we only need it gone.
        try {
            card.disconnectSettings();
            card.remove_all_transitions();
            const parent = card.get_parent();
            if (parent) {
                parent.remove_child(card);
            }
            card.destroy();
        } catch (e) {
            // already disposed by its parent - nothing to do
        }
    }

    // A dock is vertical when positioned left or right. Prefer Dash to Dock's own
    // signals, fall back to box geometry.
    _isVertical(dock, dash) {
        if (typeof dock.isHorizontal === 'boolean') {
            return !dock.isHorizontal;
        }
        // St.Side: RIGHT (1) and LEFT (3) are the vertical positions (odd values).
        if (typeof dock.position === 'number') {
            return (dock.position % 2) === 1;
        }
        const box = dash?._box;
        return box ? box.height > box.width : false;
    }

    _isDock(actor) {
        return actor.get_name() === DOCK_NAME && actor.constructor.name === DOCK_CLASS;
    }

    destroy() {
        Main.uiGroup.disconnectObject(this);
        this._settings.disconnectObject(this);

        for (const dock of [...this._cards.keys()]) {
            this._dropCard(dock);
        }

        this._settings = null;
        this._controller = null;
    }
}
