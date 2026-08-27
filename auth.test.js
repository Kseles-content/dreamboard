'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('./auth.js');

const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CONFIG = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const AUTH = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');

test('1. production config keeps auth disabled and contains no endpoint/key', () => {
    assert.match(CONFIG, /authEnabled:\s*false/);
    assert.match(CONFIG, /supabaseUrl:\s*''/);
    assert.match(CONFIG, /supabasePublishableKey:\s*''/);
    assert.doesNotMatch(CONFIG, /\.supabase\.co|sb_publishable_|sb_secret_|service_role/);
});

test('2. disabled feature performs no Supabase client creation', () => {
    let calls = 0;
    const fake = {
        DreamBoardConfig: { authEnabled: false },
        supabase: { createClient() { calls++; } },
        document: { getElementById() { return null; } }
    };
    const result = auth.initBrowser(fake);
    assert.equal(result.enabled, false);
    assert.equal(calls, 0);
});

test('3. config accepts only HTTPS Supabase URL and public key', () => {
    const good = auth.normalizeConfig({
        authEnabled: true,
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'sb_publishable_example123',
        turnstileSiteKey: 'site-key'
    });
    assert.equal(auth.validateConfig(good).ok, true);
    assert.equal(auth.validateConfig({ ...good, supabaseUrl: 'http://project.supabase.co' }).ok, false);
    assert.equal(auth.validateConfig({ ...good, supabasePublishableKey: 'sb_secret_example' }).ok, false);
});

test('4. CAPTCHA is a fail-closed signup/reset gate', async () => {
    const calls = [];
    const client = { auth: {
        signUp(value) { calls.push(value); return Promise.resolve({ data: {} }); },
        resetPasswordForEmail() { throw new Error('must not run'); }, updateUser() {},
        getSession() {}, onAuthStateChange() {}, signInWithPassword() {}, signOut() {}
    } };
    const service = auth.createAuthService(client, { requireCaptcha: true }, { origin: 'https://x', pathname: '/dreamboard/' });
    await assert.rejects(service.signUp('a@example.com', 'password1', ''), e => e.code === 'captcha_required');
    assert.equal(calls.length, 0);
    await service.signUp('a@example.com', 'password1', 'captcha-token');
    assert.equal(calls[0].options.captchaToken, 'captcha-token');
});

test('5. auth service exposes auth only and never syncs application data', () => {
    const service = auth.createAuthService({ auth: {
        getSession() {}, onAuthStateChange() {}, signInWithPassword() {}, signUp() {},
        resetPasswordForEmail() {}, updateUser() {}, signOut() {}
    } }, { requireCaptcha: false }, {});
    assert.deepEqual(Object.keys(service).sort(), ['getSession', 'onAuthStateChange', 'resetPassword', 'signIn', 'signOut', 'signUp', 'updatePassword']);
    assert.doesNotMatch(AUTH, /dreamboard_app_state|dreamboard_trash_v1|indexedDB|\.from\(|\.rpc\(|\.storage/);
});

test('12. logout and PASSWORD_RECOVERY completion are implemented without touching local data', () => {
    assert.match(INDEX, /id="auth-signout-btn"/);
    assert.match(AUTH, /PASSWORD_RECOVERY/);
    assert.match(AUTH, /client\.auth\.updateUser\(\{ password:/);
    assert.match(AUTH, /client\.auth\.signOut\(\{ scope: 'local' \}\)/);
    assert.match(AUTH, /Локальные данные сохранены/);
});

test('6. raw server messages and tokens are not reflected to users', () => {
    const secret = 'eyJprivate.server.payload';
    assert.doesNotMatch(auth.safeMessage({ message: secret }), /eyJprivate/);
    assert.equal(auth.safeMessage({ code: 'invalid_credentials' }), 'Неверный email или пароль.');
});

test('7. accessible account dialog clearly states local-first consent', () => {
    assert.match(INDEX, /<dialog id="auth-modal"[^>]*aria-labelledby="auth-modal-title"/);
    assert.match(INDEX, /role="status" aria-live="polite"/);
    assert.match(INDEX, /Регистрация необязательна/);
    assert.match(INDEX, /Синхронизация включается отдельно и только с вашего согласия/);
});

test('8. scripts are self-hosted, pinned with SRI, and no inline script remains', () => {
    assert.doesNotMatch(INDEX, /cdnjs|unpkg|jsdelivr/);
    assert.match(INDEX, /assets\/vendor\/html2canvas-1\.4\.1\.min\.js" integrity="sha384-/);
    // supabase SDK is NOT a static script in index.html — auth.js loads it dynamically
    // only when auth is enabled and the configuration validates.
    assert.doesNotMatch(INDEX, /<script[^>]*assets\/vendor\/supabase-js-2\.112\.2\.min\.js/);
    assert.match(AUTH, /assets\/vendor\/supabase-js-2\.112\.2\.min\.js/);
    assert.match(AUTH, /sha384-OUpie84zd1LdwNlK9uJJQRwab0BLqo3eKYKFh7hSVL58FSk7wPp2l0kfUMIIoaQd/);
    assert.match(AUTH, /SDK_CROSS_ORIGIN = 'anonymous'/);
    assert.match(AUTH, /script\.crossOrigin = SDK_CROSS_ORIGIN/);
    assert.doesNotMatch(INDEX, /<script(?:\s[^>]*)?>\s*(?!<\/script>)[\s\S]*?<\/script>/);
});

test('9. CSP restricts scripts and allows only required Supabase/Turnstile connections', () => {
    assert.match(INDEX, /Content-Security-Policy/);
    assert.match(INDEX, /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
    assert.match(INDEX, /connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/challenges\.cloudflare\.com/);
    assert.match(INDEX, /object-src 'none'/);
    assert.doesNotMatch(INDEX, /script-src[^;]*'unsafe-inline'/);
});

test('10. Stage 7B resources are all precached under scoped v15 cache', () => {
    for (const file of ['config.js', 'auth.js', 'sw-register.js', 'assets/vendor/html2canvas-1.4.1.min.js', 'assets/vendor/supabase-js-2.112.2.min.js']) {
        assert.ok(SW.includes("'./" + file + "'"), file + ' is precached');
        assert.ok(fs.existsSync(path.join(__dirname, file)), file + ' exists');
    }
    assert.match(SW, /CACHE_NAME = 'dreamboard-' \+ SCOPE_NAME \+ '-v15'/);
});

test('11. Turnstile loads only through the fixed official endpoint and writes token via callback', async () => {
    let appended;
    let options;
    const input = { value: '' };
    const win = {
        document: {
            createElement() { return { addEventListener(name, fn) { this[name] = fn; } }; },
            head: { appendChild(node) { appended = node; } }
        },
        turnstile: null
    };
    const pending = auth.mountTurnstile(win, 'site-key', {}, input);
    assert.equal(appended.src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    win.turnstile = { render(_container, value) { options = value; } };
    appended.load();
    assert.equal(await pending, true);
    options.callback('verified-token');
    assert.equal(input.value, 'verified-token');
    options['expired-callback']();
    assert.equal(input.value, '');
});

// --- Dynamic SDK loading (FIX REQUIRED): no script when disabled; exactly one
// --- when enabled; load failures are safe; repeated init never duplicates. ---

function makeFakeWin(config, opts) {
    const created = [];
    const appended = [];
    const document = {
        createElement(tag) {
            const el = {
                tag,
                addEventListener(name, fn) { this['on' + name] = fn; }
            };
            created.push(el);
            return el;
        },
        getElementById() { return null; },
        querySelector() { return null; },
        head: { appendChild(node) { appended.push(node); } }
    };
    const win = {
        DreamBoardConfig: config,
        document,
        location: { origin: 'https://app.example.test', pathname: '/dreamboard/' }
    };
    if (opts && opts.supabase) win.supabase = opts.supabase;
    return { win, created, appended };
}

const VALID_AUTH_CONFIG = {
    authEnabled: true,
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'sb_publishable_example123',
    turnstileSiteKey: 'site-key'
};

const tick = () => new Promise(resolve => setImmediate(resolve));

test('13. disabled feature creates NO script tag and loads no SDK', async () => {
    const { win, created } = makeFakeWin({ authEnabled: false });
    const result = auth.initBrowser(win);
    assert.equal(result.enabled, false);
    await tick();
    assert.equal(created.length, 0, 'no <script> may be created when auth is disabled');
});

test('14. enabled feature creates exactly one SDK script with pinned SRI; repeated init does not duplicate', async () => {
    const { win, created } = makeFakeWin(VALID_AUTH_CONFIG);
    auth.initBrowser(win);
    await tick();
    assert.equal(created.length, 1);
    const script = created[0];
    assert.equal(script.src, 'assets/vendor/supabase-js-2.112.2.min.js');
    assert.equal(script.integrity, 'sha384-OUpie84zd1LdwNlK9uJJQRwab0BLqo3eKYKFh7hSVL58FSk7wPp2l0kfUMIIoaQd');
    assert.equal(script.crossOrigin, 'anonymous');
    // повторная инициализация (например, повторный DOMContentLoaded-вызов) не дублирует загрузку
    auth.initBrowser(win);
    await tick();
    assert.equal(created.length, 1, 'SDK <script> must be created exactly once');
});

test('15. SDK load failure is safe: resolves disabled, no exception, no second script', async () => {
    const { win, created } = makeFakeWin(VALID_AUTH_CONFIG);
    auth.initBrowser(win);
    await tick();
    assert.equal(created.length, 1);
    // симулируем сетевую ошибку загрузки — не должно быть throw/unhandled rejection
    created[0].onerror();
    await tick();
    // повторный init после ошибки не плодит новые <script> (fail-closed, один шанс за страницу)
    auth.initBrowser(win);
    await tick();
    assert.equal(created.length, 1, 'no duplicate script after a failed load');
});

test('16. already-loaded SDK is reused: no script tag is created at all', async () => {
    const authStub = {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({}),
        signInWithPassword() {}, signUp() {}, resetPasswordForEmail() {},
        updateUser() {}, signOut() {}
    };
    const { win, created } = makeFakeWin(VALID_AUTH_CONFIG, {
        supabase: { createClient() { return { auth: authStub }; } }
    });
    auth.initBrowser(win);
    await tick();
    assert.equal(created.length, 0, 'no SDK script needed when supabase is already present');
});
