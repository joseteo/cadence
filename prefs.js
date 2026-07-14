import Adw  from 'gi://Adw';
import Gtk  from 'gi://Gtk';
import Gio  from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class DockMediaPlayerPreferences extends ExtensionPreferences
{
    fillPreferencesWindow(window)
    {
        const settings = this.getSettings();

        this._addAppearancePage(window, settings);
        this._addBehaviorPage(window, settings);
        this._addAdvancedPage(window, settings);
        this._addAboutPage(window);
    }

    _addAppearancePage(window, settings)
    {
        const page = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(page);

        // -- Widget Style --

        const styleGroup = new Adw.PreferencesGroup({
            title: 'Widget Style',
            description: 'Control how the widget looks inside the dock',
        });
        page.add(styleGroup);

        styleGroup.add(this._makeSpinRow(
            'Widget Width',
            'Width of the expanded media widget in pixels',
            settings, 'widget-width',
            { lower: 160, upper: 500, step: 10 },
        ));

        styleGroup.add(this._makeSpinRow(
            'Background Opacity',
            'Background opacity of the widget (0.0 - 1.0)',
            settings, 'background-opacity',
            { lower: 0.0, upper: 1.0, step: 0.05, digits: 2 },
        ));

        const tintRow = new Adw.SwitchRow({
            title: 'Tint From Album Art',
            subtitle: 'Colour the widget with the dominant colour of the cover',
        });
        settings.bind('tint-from-art', tintRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        styleGroup.add(tintRow);

        styleGroup.add(this._makeSpinRow(
            'Corner Radius',
            'Roundness of the card corners in pixels (0 = sharp)',
            settings, 'corner-radius',
            { lower: 0, upper: 24, step: 1 },
        ));

        // -- Album Art --

        const artGroup = new Adw.PreferencesGroup({
            title: 'Album Art',
            description: 'Album art thumbnail appearance',
        });
        page.add(artGroup);

        const showArtRow = new Adw.SwitchRow({
            title: 'Show Album Art',
            subtitle: 'Display the album art thumbnail',
        });
        settings.bind('show-album-art', showArtRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        artGroup.add(showArtRow);

        const artStyleModel = new Gtk.StringList();
        artStyleModel.append('Rounded (concentric with card)');
        artStyleModel.append('Circle');
        artStyleModel.append('Square');

        const artStyleRow = new Adw.ComboRow({
            title: 'Art Shape',
            subtitle: 'Shape of the album art thumbnail',
            model: artStyleModel,
        });

        const artStyles = ['rounded', 'circle', 'square'];
        artStyleRow.set_selected(Math.max(0, artStyles.indexOf(settings.get_string('art-style'))));
        artStyleRow.connect('notify::selected', () => {
            const value = artStyles[artStyleRow.selected] ?? 'rounded';
            if (settings.get_string('art-style') !== value) settings.set_string('art-style', value);
        });
        artGroup.add(artStyleRow);

        // -- Visible Elements --

        const visGroup = new Adw.PreferencesGroup({
            title: 'Visible Elements',
            description: 'Choose which parts of the widget are shown',
        });
        page.add(visGroup);

        const showArtistRow = new Adw.SwitchRow({
            title: 'Show Artist Name',
            subtitle: 'Display artist name below the track title',
        });
        settings.bind('show-artist', showArtistRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        visGroup.add(showArtistRow);

        const showControlsRow = new Adw.SwitchRow({
            title: 'Show Playback Controls',
            subtitle: 'Display media control buttons',
        });
        settings.bind('show-controls', showControlsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        visGroup.add(showControlsRow);

        // -- Typography --

        const typoGroup = new Adw.PreferencesGroup({
            title: 'Typography',
            description: 'Scale the text size to your preference',
        });
        page.add(typoGroup);

        typoGroup.add(this._makeSpinRow(
            'Font Scale',
            '1.0 is the default; lower is smaller, higher is larger',
            settings, 'font-scale',
            { lower: 0.6, upper: 1.6, step: 0.1, digits: 1 },
        ));
    }

    _addBehaviorPage(window, settings)
    {
        const page = new Adw.PreferencesPage({
            title: 'Behavior',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // -- Dock Integration --

        const dockGroup = new Adw.PreferencesGroup({
            title: 'Dock Integration',
            description: 'Control how the widget integrates with Dash to Dock',
        });
        page.add(dockGroup);

        const posModel = new Gtk.StringList();
        posModel.append('Start (before app icons)');
        posModel.append('End (after app icons)');

        const posRow = new Adw.ComboRow({
            title: 'Widget Position',
            subtitle: 'Where to insert the widget in the dock',
            model: posModel,
        });
        posRow.set_selected(settings.get_string('widget-position') === 'start' ? 0 : 1);
        posRow.connect('notify::selected', () => {
            const value = posRow.selected === 0 ? 'start' : 'end';
            if (settings.get_string('widget-position') !== value) settings.set_string('widget-position', value);
        });
        dockGroup.add(posRow);

        const allMonRow = new Adw.SwitchRow({
            title: 'Show On All Monitors',
            subtitle: 'Show the widget on every dock, not just the primary monitor',
        });
        settings.bind('show-on-all-monitors', allMonRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        dockGroup.add(allMonRow);

        // -- Interactions --

        const interGroup = new Adw.PreferencesGroup({
            title: 'Interactions',
            description: 'Customise scroll and click behaviour on the widget',
        });
        page.add(interGroup);

        const scrollModel = new Gtk.StringList();
        scrollModel.append('Change volume');
        scrollModel.append('Skip track');
        scrollModel.append('Disabled');

        const scrollRow = new Adw.ComboRow({
            title: 'Scroll Action',
            subtitle: 'What happens when you scroll on the widget',
            model: scrollModel,
        });
        const scrollOpts = ['volume', 'track', 'none'];
        scrollRow.set_selected(Math.max(0, scrollOpts.indexOf(settings.get_string('scroll-action'))));
        scrollRow.connect('notify::selected', () => {
            const value = scrollOpts[scrollRow.selected] ?? 'volume';
            if (settings.get_string('scroll-action') !== value) settings.set_string('scroll-action', value);
        });
        interGroup.add(scrollRow);

        const clickModel = new Gtk.StringList();
        clickModel.append('Open the player');
        clickModel.append('Play / Pause');
        clickModel.append('Disabled');

        const clickRow = new Adw.ComboRow({
            title: 'Click Action',
            subtitle: 'What happens when you click on the card',
            model: clickModel,
        });
        const clickOpts = ['open-player', 'play-pause', 'none'];
        clickRow.set_selected(Math.max(0, clickOpts.indexOf(settings.get_string('click-action'))));
        clickRow.connect('notify::selected', () => {
            const value = clickOpts[clickRow.selected] ?? 'open-player';
            if (settings.get_string('click-action') !== value) settings.set_string('click-action', value);
        });
        interGroup.add(clickRow);

        // -- Animations --

        const animGroup = new Adw.PreferencesGroup({
            title: 'Animations',
        });
        page.add(animGroup);

        animGroup.add(this._makeSpinRow(
            'Animation Duration',
            'Speed of expand and collapse in milliseconds (0 to disable)',
            settings, 'animation-duration',
            { lower: 0, upper: 1000, step: 50 },
        ));
    }

    _addAdvancedPage(window, settings)
    {
        const page = new Adw.PreferencesPage({
            title: 'Advanced',
            icon_name: 'preferences-other-symbolic',
        });
        window.add(page);

        // -- Cache --

        const cacheGroup = new Adw.PreferencesGroup({
            title: 'Cache',
            description: 'Cadence caches remote album art (e.g. from Spotify) to disk',
        });
        page.add(cacheGroup);

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'cadence']);

        const clearRow = new Adw.ActionRow({
            title: 'Clear Album Art Cache',
            subtitle: cacheDir,
            activatable: true,
        });
        clearRow.add_suffix(new Gtk.Image({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        clearRow.connect('activated', () => {
            this._clearCacheDir(cacheDir);
            clearRow.set_subtitle('Cache cleared');
        });
        cacheGroup.add(clearRow);

        // -- Reset --

        const resetGroup = new Adw.PreferencesGroup({
            title: 'Reset',
        });
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: 'Reset All Settings',
            subtitle: 'Restore every option to its default value',
            activatable: true,
        });
        resetRow.add_suffix(new Gtk.Image({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        resetRow.connect('activated', () => {
            const schema = settings.settings_schema;
            for (const key of schema.list_keys()) {
                settings.reset(key);
            }
        });
        resetGroup.add(resetRow);
    }

    _addAboutPage(window)
    {
        const page = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });
        window.add(page);

        const version = this.metadata['version-name'] ?? String(this.metadata.version ?? '');
        const infoGroup = new Adw.PreferencesGroup({
            title: this.metadata.name ?? 'Cadence',
            description: `Version ${version}\nA media player widget embedded in the dock.`,
        });
        page.add(infoGroup);

        const authorGroup = new Adw.PreferencesGroup({ title: 'Author' });
        page.add(authorGroup);
        authorGroup.add(new Adw.ActionRow({ title: 'Jose Teo Lorente', subtitle: 'Creator and Developer' }));
        authorGroup.add(this._makeLinkRow('Website', 'joseteo.github.io', 'https://joseteo.github.io'));
        authorGroup.add(this._makeLinkRow('GitHub', 'github.com/joseteo', 'https://github.com/joseteo'));

        const supportGroup = new Adw.PreferencesGroup({
            title: 'Support',
            description: 'If you enjoy Cadence, you can support its development.',
        });
        page.add(supportGroup);
        supportGroup.add(this._makeLinkRow('Donate with PayPal', 'paypal.me/joseteolorente', 'https://paypal.me/joseteolorente'));
    }

    // -- helpers --

    _makeLinkRow(title, subtitle, uri)
    {
        const row = new Adw.ActionRow({ title, subtitle, activatable: true });
        row.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        row.connect('activated', () => Gio.AppInfo.launch_default_for_uri(uri, null));
        return row;
    }

    _makeSpinRow(title, subtitle, settings, key, params)
    {
        const row = new Adw.ActionRow({ title, subtitle });

        const spin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: params.lower,
                upper: params.upper,
                step_increment: params.step,
            }),
            digits: params.digits ?? 0,
            valign: Gtk.Align.CENTER,
            width_request: 120,
        });

        settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(spin);
        row.set_activatable_widget(spin);
        return row;
    }

    _clearCacheDir(path)
    {
        try {
            const dir = Gio.File.new_for_path(path);
            if (!dir.query_exists(null)) return;

            const enumerator = dir.enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NONE, null
            );
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const child = dir.get_child(info.get_name());
                child.delete(null);
            }
        } catch (e) {
            logError(e, 'Cadence: failed to clear cache');
        }
    }
}
