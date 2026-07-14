/* SPDX-License-Identifier: GPL-2.0-or-later */

import Gio from 'gi://Gio';

// Watches the session bus for MPRIS players, tracks which one is most relevant, and
// reports its state through a single callback. It is a pure model: it holds no view
// and knows nothing about the dock. The dock manager subscribes to it.

export const PlaybackStatus = {
    Playing: 'Playing',
    Paused: 'Paused',
    Stopped: 'Stopped',
};

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';

const playerIface = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Stop"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
  </interface>
</node>`;

const rootIface = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="CanRaise" type="b" access="read"/>
  </interface>
</node>`;

const RootProxy = Gio.DBusProxy.makeProxyWrapper(rootIface);

const busIface = `
<node>
  <interface name="org.freedesktop.DBus">
    <method name="ListNames">
      <arg direction="out" type="as"/>
    </method>
    <signal name="NameOwnerChanged">
      <arg direction="out" type="s"/>
      <arg direction="out" type="s"/>
      <arg direction="out" type="s"/>
    </signal>
  </interface>
</node>`;

const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(playerIface);
const BusProxy = Gio.DBusProxy.makeProxyWrapper(busIface);

export class PlayerWatcher {
    // onChange is called with { busName, status, track } for the active player, or
    // { busName: null, status: Stopped, track: null } when nothing is playing.
    constructor(onChange) {
        this._onChange = onChange;
        this._proxies = new Map();      // busName -> player proxy
        this._rootProxies = new Map();  // busName -> root proxy (for Raise)
        this._signalIds = new Map();    // busName -> g-properties-changed id
        this._stack = [];               // most-recently-active player first
        this._bus = null;
        this._busSignalIds = [];
        this._sleepSignalId = null;
    }

    start() {
        if (this._bus) {
            return;
        }

        this._bus = new BusProxy(Gio.DBus.session, 'org.freedesktop.DBus', '/org/freedesktop/DBus');

        const [names] = this._bus.ListNamesSync();
        for (const name of names) {
            if (this._accepts(name)) {
                this._addPlayer(name);
            }
        }

        this._busSignalIds.push(
            this._bus.connectSignal('NameOwnerChanged', (proxy, sender, [name, oldOwner, newOwner]) => {
                if (!this._accepts(name)) {
                    return;
                }
                if (newOwner && !oldOwner) {
                    this._addPlayer(name);
                } else if (!newOwner && oldOwner) {
                    this._removePlayer(name);
                }
            })
        );

        // login1 emits PrepareForSleep(false) on resume; re-scan then, because proxies
        // can go stale across suspend.
        this._sleepSignalId = Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1',
            'org.freedesktop.login1.Manager',
            'PrepareForSleep',
            '/org/freedesktop/login1',
            null,
            Gio.DBusSignalFlags.NONE,
            (_c, _s, _p, _i, _sig, params) => {
                const [goingToSleep] = params.deep_unpack();
                if (!goingToSleep) {
                    this._rescan();
                }
            }
        );
    }

    // ---- playback controls, all target the active player ----

    toggle() {
        this._activeProxy()?.PlayPauseRemote((_r, e) => e && logError(e));
    }

    next() {
        this._activeProxy()?.NextRemote((_r, e) => e && logError(e));
    }

    previous() {
        this._activeProxy()?.PreviousRemote((_r, e) => e && logError(e));
    }

    raise() {
        const bus = this._activeBus();
        if (!bus) return;
        const root = this._rootProxies.get(bus);
        if (root?.CanRaise) {
            root.RaiseRemote((_r, e) => e && logError(e));
        }
    }

    adjustVolume(delta) {
        const proxy = this._activeProxy();
        if (!proxy) return;
        const current = proxy.Volume ?? 1.0;
        proxy.Volume = Math.max(0.0, Math.min(1.0, current + delta));
    }

    // ---- internals ----

    _accepts(name) {
        return name.startsWith(MPRIS_PREFIX);
    }

    _addPlayer(busName) {
        if (this._proxies.has(busName)) {
            return;
        }

        const proxy = new PlayerProxy(Gio.DBus.session, busName, MPRIS_PATH);
        this._proxies.set(busName, proxy);

        const root = new RootProxy(Gio.DBus.session, busName, MPRIS_PATH);
        this._rootProxies.set(busName, root);

        const id = proxy.connect('g-properties-changed', (p) => {
            this._onStatus(busName, p.PlaybackStatus ?? PlaybackStatus.Stopped);
        });
        this._signalIds.set(busName, id);

        this._onStatus(busName, proxy.PlaybackStatus ?? PlaybackStatus.Stopped, proxy);
    }

    _removePlayer(busName) {
        const proxy = this._proxies.get(busName);
        if (proxy) {
            const id = this._signalIds.get(busName);
            if (id != null) {
                proxy.disconnect(id);
            }
        }

        this._proxies.delete(busName);
        this._rootProxies.delete(busName);
        this._signalIds.delete(busName);

        const idx = this._stack.indexOf(busName);
        if (idx !== -1) {
            this._stack.splice(idx, 1);
        }

        const nextBus = this._activeBus();
        if (nextBus) {
            const p = this._proxies.get(nextBus);
            this._onStatus(nextBus, p.PlaybackStatus ?? PlaybackStatus.Stopped, p);
        } else {
            this._emit(null, PlaybackStatus.Stopped, null);
        }
    }

    _rescan() {
        for (const [busName, proxy] of this._proxies) {
            const id = this._signalIds.get(busName);
            if (id != null) {
                proxy.disconnect(id);
            }
        }
        this._proxies.clear();
        this._rootProxies.clear();
        this._signalIds.clear();
        this._stack = [];

        const [names] = this._bus.ListNamesSync();
        for (const name of names) {
            if (this._accepts(name)) {
                this._addPlayer(name);
            }
        }

        if (this._stack.length === 0) {
            this._emit(null, PlaybackStatus.Stopped, null);
        }
    }

    // Keep the stack ordered so the currently-playing player floats to the top, and
    // only report changes coming from whichever player is active.
    _onStatus(busName, status, manualProxy = null) {
        const proxy = manualProxy || this._proxies.get(busName);
        if (!proxy) {
            return;
        }

        if (status === PlaybackStatus.Playing) {
            const idx = this._stack.indexOf(busName);
            if (idx !== -1) {
                this._stack.splice(idx, 1);
            }
            this._stack.unshift(busName);
        } else if (!this._stack.includes(busName)) {
            this._stack.push(busName);
        }

        if (busName !== this._activeBus()) {
            return;
        }

        this._emit(busName, status, this._trackOf(proxy));
    }

    _trackOf(proxy) {
        const track = { title: 'Unknown Title', artist: 'Unknown Artist', artUrl: null };

        const variant = proxy.get_cached_property('Metadata');
        if (!variant) {
            return track;
        }

        const data = variant.recursiveUnpack();
        if (data['xesam:title']) {
            track.title = String(data['xesam:title']);
        }
        if (data['xesam:artist']) {
            const artist = data['xesam:artist'];
            track.artist = Array.isArray(artist) ? artist.join(', ') : String(artist);
        }
        if (data['mpris:artUrl']) {
            track.artUrl = String(data['mpris:artUrl']);
        }
        return track;
    }

    _activeBus() {
        return this._stack.find((b) => this._proxies.get(b)?.PlaybackStatus === PlaybackStatus.Playing)
            ?? this._stack[0];
    }

    _activeProxy() {
        const bus = this._activeBus();
        return bus ? this._proxies.get(bus) : null;
    }

    _emit(busName, status, track) {
        this._onChange?.(busName, status, track);
    }

    destroy() {
        for (const id of this._busSignalIds) {
            this._bus?.disconnectSignal(id);
        }
        this._busSignalIds = [];

        if (this._sleepSignalId != null) {
            Gio.DBus.system.signal_unsubscribe(this._sleepSignalId);
            this._sleepSignalId = null;
        }

        for (const [busName, proxy] of this._proxies) {
            const id = this._signalIds.get(busName);
            if (id != null) {
                proxy.disconnect(id);
            }
        }
        this._proxies.clear();
        this._rootProxies.clear();
        this._signalIds.clear();
        this._stack = [];
        this._onChange = null;
        this._bus = null;
    }
}
