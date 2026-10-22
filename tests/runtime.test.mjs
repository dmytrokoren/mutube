import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isKids } from '../vendor/mods/tvOS.js';
import { cobaltVersion, cobaltReleaseUrl } from '../vendor/mods/cobaltRelease.js';
globalThis.window = {};
function useProfile(theme) { window.tectonicConfig = {clientData: {clientTheme: theme}}; delete window._yttv; }
const source = name => fs.readFileSync(new URL('../vendor/mods/' + name, import.meta.url), 'utf8');
const entry = endpoint => ({guideEntryRenderer: {navigationEndpoint: endpoint}});
const guide = items => ({items: [{guideSectionRenderer: {items}}]});
const adult = guide([entry({browseEndpoint: {browseId: 'FEwhat_to_watch'}}), entry({searchEndpoint: {}})]);
// Synthetic fixture for upstream's documented Kids guide shape. Device captures
// are still needed to confirm the server schema used by YouTube 4.54.01.
const kids = guide([entry({kidsHomeEndpoint: {}}), entry({kidsSubscriptionsEndpoint: {}}), entry({searchEndpoint: {}})]);
test('native Kids theme overrides misleading browse IDs and follows live switches', () => {
    useProfile('CLASSIC'); assert.equal(isKids(), false);
    useProfile('KIDS'); assert.equal(isKids(), true);
    useProfile('CLASSIC'); assert.equal(isKids(), false);
    window.tectonicConfig = {}; assert.equal(isKids(), true);
});
test('active native identity takes precedence over stale theme, without consulting inactive accounts', () => {
    useProfile('CLASSIC');
    const service = {minifiedMember: {identityType: 'PERSONA_CHILD'}};
    window._yttv = {registry: {mappings: new Map([['CurrentIdentityService', {}]]),
        get: name => {assert.equal(name, 'CurrentIdentityService'); return service; }},
        inactiveChildAccount: {identityType: 'PERSONA_CHILD'}};
    assert.equal(isKids(), true);
    service.minifiedMember = {identityType: 'CORE_ID'};
    window.tectonicConfig.clientData.clientTheme = 'KIDS';
    assert.equal(isKids(), false);
    service.minifiedMember = {identityType: 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST_KID'};
    assert.equal(isKids(), true);
    service.minifiedMember = {identityType: 'UNICORN_LITE_PROFILE'};
    assert.equal(isKids(), true);
    delete window._yttv;
});
test('native guides retain every item and order, including unknown endpoints and Shorts', () => {
    const context = { JSON: {parse: JSON.parse} };
    vm.createContext(context);
    vm.runInContext(source('ui/customGuideAction.js').replace(/^import .*;\n/, ''), context);
    for (const fixture of [adult, kids, guide([entry({browseEndpoint:{browseId:'FEshorts'}})])]) {
        const json = JSON.stringify(fixture);
        assert.equal(JSON.stringify(context.JSON.parse(json)), json);
    }
});
test('only custom TizenTube category is suppressed for Kids; adult settings still add it', () => {
    const context = { isKids, t: x => x,
        SettingActionRenderer: (...args) => args,
        SettingsCategory: (id, entries) => ({settingCategoryCollectionRenderer: {categoryId: id, items: entries}}) };
    vm.createContext(context);
    const code = source('ui/customYTSettings.js').replace(/^import .*;\n/gm, '').replace(/export \{[\s\S]*$/, '');
    vm.runInContext(code, context);
    const settings = {items: [{id:'native-settings'}, {id:'privacy'}]};
    useProfile('KIDS'); context.PatchSettings(settings);
    assert.deepEqual(settings.items.map(x => x.id || x.settingCategoryCollectionRenderer?.categoryId), ['native-settings', 'privacy']);
    useProfile('CLASSIC'); context.PatchSettings(settings);
    assert.deepEqual(settings.items.map(x => x.id || x.settingCategoryCollectionRenderer?.categoryId), ['tizentube_category', 'native-settings', 'privacy']);
    assert.match(settings.items[0].settingCategoryCollectionRenderer.items[0][2].customAction.action, /^TT_SETTINGS_SHOW$/);
    context.PatchSettings(settings);
    assert.equal(settings.items.length, 3, 'adult patching is idempotent');
    useProfile('KIDS'); context.PatchSettings(settings);
    assert.deepEqual(settings.items.map(x => x.id), ['native-settings', 'privacy']);
    useProfile('CLASSIC'); context.PatchSettings(settings);
    assert.equal(settings.items.length, 3, 'adult category returns after switching back');
});
test('updater never checks automatically; manual results use welcome-style toast without opening a page', async () => {
    const popups = []; let calls = 0; let response = {tag_name: 'v' + cobaltVersion};
    const newerVersion = cobaltVersion.split('.').map((part, index) => index === 2 ? Number(part) + 1 : part).join('.');
    const context = {cobaltVersion, cobaltReleaseUrl, setTimeout: () => 1, clearTimeout: () => {},
        fetch: async url => { assert.equal(url, context.cobaltReleaseUrl); calls++; if (response instanceof Error) throw response;
            return {ok:true,json:async () => response}; },
        showToast: (title, subtitle) => popups.push({title, subtitle}),
        showModal: () => assert.fail('Manual update results must not open a modal page')};
    vm.createContext(context);
    vm.runInContext(source('features/updater.js').replace(/^import .*;\n/gm, '').replace('export default ', ''), context);
    assert.equal(calls, 0); assert.equal(popups.length, 0);
    await context.checkForUpdates();
    assert.equal(popups.at(-1).title, 'TizenTube is up to date');
    assert.equal(popups.at(-1).subtitle, 'You are using the latest version (' + cobaltVersion + ') of TizenTube Cobalt.');
    response = {tag_name: 'v' + newerVersion}; await context.checkForUpdates();
    assert.equal(popups.at(-1).title, 'TizenTube Cobalt update available');
    assert.ok(popups.at(-1).subtitle.includes('Version ' + newerVersion + ' is available'));
    response = Error('offline'); await context.checkForUpdates();
    assert.equal(popups.at(-1).title, 'Unable to check for updates');
    assert.equal(popups.at(-1).subtitle, 'offline');
    assert.equal(calls, 3);
    assert.doesNotMatch(source('ui/settings.js'), /checkForUpdatesOnStartup|value: 'enableUpdater'/);
});

const bootstrapTemplate = fs.readFileSync(new URL('../bootstrap.js', import.meta.url), 'utf8');
function bootstrapHarness(bundle) {
    const timers = [];
    const errors = [];
    const context = {document: {head: {}, body: {}}, setTimeout: (callback, delay) => timers.push({callback, delay}), console: {error: message => errors.push(message)}};
    context.window = context;
    vm.createContext(context);
    const code = bootstrapTemplate.replace('/* MUTUBE_BUNDLE */', bundle);
    return {context, timers, errors, run: () => vm.runInContext(code, context), tick: () => timers.shift().callback()};
}
test('bundled userscript runs after native YouTube bootstrap, once only', () => {
    const harness = bootstrapHarness('window.userscriptSawNative = window._yttv.nativeReady; window.starts = (window.starts || 0) + 1;');
    harness.run();
    assert.equal(harness.context.__mutubeStatus.state, 'scheduled');
    assert.equal(harness.context.starts, undefined);
    // Model the native script that follows the injected prefix in the same
    // HTMLScriptElement::Execute call. It must run before the queued callback.
    vm.runInContext('window._yttv = {nativeReady: true}; window.nativeStarted = true;', harness.context);
    harness.tick();
    assert.equal(harness.context.nativeStarted, true);
    assert.equal(harness.context.userscriptSawNative, true);
    assert.equal(harness.context.__mutubeStatus.state, 'initialized');
    harness.run();
    assert.equal(harness.context.starts, 1);
    assert.equal(harness.timers.length, 0);
});
test('userscript initialization exceptions cannot abort native bootstrap', () => {
    const harness = bootstrapHarness('throw Error("simulated TizenTube initialization failure");');
    harness.run();
    vm.runInContext('window._yttv = {}; window.nativeStarted = true;', harness.context);
    assert.doesNotThrow(() => harness.tick());
    assert.equal(harness.context.nativeStarted, true);
    assert.equal(harness.context.__mutubeStatus.state, 'failed');
    assert.match(harness.context.__mutubeStatus.error, /simulated TizenTube/);
    assert.equal(harness.errors.length, 1);
});
test('bootstrap waits for native namespace and DOM, and stops retrying after timeout', () => {
    const harness = bootstrapHarness('window.started = true;');
    harness.run(); harness.tick();
    assert.equal(harness.context.__mutubeStatus.state, 'waiting-for-youtube');
    harness.context._yttv = {}; harness.context.document.body = null;
    harness.tick(); assert.equal(harness.context.started, undefined);
    harness.context.document.body = {}; harness.tick();
    assert.equal(harness.context.started, true);
    const neverReady = bootstrapHarness('throw Error("must not run");');
    neverReady.run();
    for (let i = 0; i < 600; i++) neverReady.tick();
    assert.equal(neverReady.context.__mutubeStatus.state, 'timed-out');
    assert.equal(neverReady.timers.length, 0);
});

test('missing, malformed or incompatible recurring-actions cache cannot abort startup', () => {
    const module = source('ui/disableWhosWatching.js').replace(/^import .*;\n/gm, '');
    for (const stored of [undefined, '', '{bad', 'null', '{}', '{"data":{"data":{}}}']) {
        const storage = {};
        if (stored !== undefined) storage['yt.leanback.default::recurring_actions'] = stored;
        const before = JSON.stringify(storage);
        const context = {localStorage: storage, configRead: () => false,
            configChangeEmitter: {addEventListener() {}}, setInterval, clearInterval};
        vm.createContext(context);
        assert.doesNotThrow(() => vm.runInContext(module + ';globalThis.moduleCompleted = true;', context));
        assert.equal(context.moduleCompleted, true);
        assert.equal(JSON.stringify(storage), before);
    }
});

test('the shared welcome notification helper uses a TOAST popup', () => {
    let command;
    const context = {resolveCommand: value => {command = value;}};
    vm.createContext(context);
    const code = source('ui/ytUI.js').replace(/^import .*;\n/gm, '').split('function OverlayPanelHeaderRenderer')[0];
    vm.runInContext(code, context);
    context.showToast('TizenTube Updater', 'You are up to date.');
    assert.equal(command.openPopupAction.popupType, 'TOAST');
    assert.equal(command.openPopupAction.popup.overlayToastRenderer.title.simpleText, 'TizenTube Updater');
    assert.equal(command.openPopupAction.popup.overlayToastRenderer.subtitle.simpleText, 'You are up to date.');
});
