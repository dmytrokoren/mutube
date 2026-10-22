// Exercise the complete generated userscript, not only isolated modules. jsdom
// is a desktop DOM harness; these tests do not claim to emulate Cobalt or tvOS.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const root = path.resolve(__dirname, '..');
const bundle = fs.readFileSync(path.join(root, 'vendor/dist/userScript.js'), 'utf8');
const compat = fs.readFileSync(path.join(root, 'inject.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8').replace('/* MUTUBE_COMPAT */', compat);

function environment() {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        url: 'https://www.youtube.com/tv', runScripts: 'outside-only', virtualConsole
    });
    dom.window.MediaSource = {isTypeSupported: type => !type.includes('height=')};
    dom.window.fetch = () => Promise.resolve({ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('')});
    return {dom, window: dom.window, errors};
}

test('full bundle starts with absent YouTube cache and native bootstrap completes first', async () => {
    const {dom, window, errors} = environment();
    try {
        assert.equal(window.localStorage.getItem('yt.leanback.default::recurring_actions'), null);
        window.eval(bootstrap.replace('/* MUTUBE_BUNDLE */', bundle) + '\nwindow._yttv = {}; window.nativeBootstrapCompleted = true;');
        assert.equal(window.nativeBootstrapCompleted, true);
        assert.equal(window.__mutubeStatus.state, 'scheduled');
        // 4K capability compatibility must still precede YouTube bootstrap.
        assert.equal(window.MediaSource.isTypeSupported('video/webm; height=2160'), true);
        await new Promise(resolve => setTimeout(resolve, 60));
        assert.equal(window.__mutubeStatus.state, 'initialized', window.__mutubeStatus.error);
        assert.deepEqual(errors, []);
        assert.equal(window.MediaSource.isTypeSupported('video/webm; height=2160'), true);
        const guide = {items: [{guideSectionRenderer: {items: [
            {guideEntryRenderer: {navigationEndpoint: {kidsHomeEndpoint: {}}}},
            {guideEntryRenderer: {navigationEndpoint: {kidsSubscriptionsEndpoint: {}}}}
        ]}}]};
        assert.equal(window.JSON.stringify(window.JSON.parse(JSON.stringify(guide))), JSON.stringify(guide));
        assert.equal(window.localStorage.getItem('yt.leanback.default::recurring_actions'), null);
    } finally { dom.window.close(); }
});

test('full bundle tolerates corrupt saved TizenTube configuration and recurring-actions data', () => {
    const {dom, window} = environment();
    try {
        window._yttv = {};
        window.localStorage.setItem('ytaf-configuration', 'null');
        window.localStorage.setItem('yt.leanback.default::recurring_actions', '{invalid');
        assert.doesNotThrow(() => window.eval(bundle + ';window.bundleCompleted = true;'));
        assert.equal(window.bundleCompleted, true);
        assert.equal(window.localStorage.getItem('yt.leanback.default::recurring_actions'), '{invalid');
    } finally { dom.window.close(); }
});

test('optional PiP initialization tolerates delayed native services', async () => {
    const {dom, window, errors} = environment();
    try {
        window._yttv = {};
        window.eval(bootstrap.replace('/* MUTUBE_BUNDLE */', bundle));
        await new Promise(resolve => setTimeout(resolve, 35));
        assert.equal(window.__mutubeStatus.state, 'initialized');
        const preview = {start: value => 'preview:' + value, stop: () => 'stopped'};
        const originalStart = preview.start;
        window._yttv.serviceRegistry = {
            mappings: {},
            get: name => name === 'PlayerService' ? {} : name === 'PlaybackPreviewService' ? preview : undefined
        };
        await new Promise(resolve => setTimeout(resolve, 60));
        assert.notEqual(preview.start, originalStart);
        assert.equal(preview.start('ok'), 'preview:ok');
        window.isPipPlaying = true;
        assert.equal(preview.start('ok'), undefined);
        assert.deepEqual(errors, []);
    } finally { dom.window.close(); }
});

test('full bundle removes only its own Settings category in Kids, even with adult-style guide browse IDs', () => {
    const {dom, window} = environment();
    try {
        window._yttv = {};
        window.tectonicConfig = {clientData: {clientTheme: 'CLASSIC'}};
        window.eval(bundle);
        const native = {title: {runs: [{text: 'Settings'}]}, items: [
            {settingCategoryCollectionRenderer: {categoryId: 'native-general', items: []}},
            {settingCategoryCollectionRenderer: {categoryId: 'native-privacy', items: []}}
        ]};
        const ids = response => Array.from(response.items, item => item.settingCategoryCollectionRenderer.categoryId);
        const adult = window.JSON.parse(JSON.stringify(native));
        assert.deepEqual(ids(adult), ['tizentube_category', 'native-general', 'native-privacy']);
        // The previous guide heuristic allowed one browse ID to classify Kids
        // as adult. The native profile signal must win regardless of the guide.
        window.tectonicConfig.clientData.clientTheme = 'KIDS';
        window.JSON.parse(JSON.stringify({items: [{guideSectionRenderer: {items: [
            {guideEntryRenderer: {navigationEndpoint: {browseEndpoint: {browseId: 'FEwhat_to_watch'}}}},
            {guideEntryRenderer: {navigationEndpoint: {searchEndpoint: {}}}}
        ]}}]}));
        const child = window.JSON.parse(JSON.stringify(adult));
        assert.deepEqual(ids(child), ['native-general', 'native-privacy']);
        assert.equal(JSON.stringify(child.items), JSON.stringify(native.items));
        window.tectonicConfig.clientData.clientTheme = 'CLASSIC';
        assert.deepEqual(ids(window.JSON.parse(JSON.stringify(child))), ['tizentube_category', 'native-general', 'native-privacy']);
    } finally { dom.window.close(); }
});
