/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { PlayerWatcher } from './lib/playerWatcher.js';
import { DockManager } from './lib/dockManager.js';

// Entry point. It owns two collaborators and does nothing else itself:
//   - PlayerWatcher: the MPRIS model on the session bus.
//   - DockManager: the view, one track card per dock/monitor.
// The watcher reports state; the manager renders it.
export default class CadenceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._watcher = new PlayerWatcher((busName, status, track) => {
            this._dock?.onChange(busName, status, track);
        });
        this._dock = new DockManager(this._settings, this._watcher);

        this._dock.start();
        this._watcher.start();
    }

    disable() {
        // Tear the watcher down first so no status callback reaches a dock that is
        // already being destroyed.
        this._watcher?.destroy();
        this._watcher = null;

        this._dock?.destroy();
        this._dock = null;

        this._settings = null;
    }
}
