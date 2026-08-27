(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DreamBoardAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var PUBLIC_KEY_RE = /^(?:sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

    // Self-hosted, pinned Supabase SDK: loaded dynamically ONLY when auth is
    // enabled and the configuration validates (fail-closed). The integrity hash
    // is the verified SHA384 of assets/vendor/supabase-js-2.112.2.min.js.
    var SDK_SRC = 'assets/vendor/supabase-js-2.112.2.min.js';
    var SDK_INTEGRITY = 'sha384-OUpie84zd1LdwNlK9uJJQRwab0BLqo3eKYKFh7hSVL58FSk7wPp2l0kfUMIIoaQd';
    var SDK_CROSS_ORIGIN = 'anonymous';

    // Per-window loader cache: a second init() never duplicates the <script>.
    function loadSupabaseSdk(win) {
        if (win.supabase && typeof win.supabase.createClient === 'function') return Promise.resolve(true);
        if (win.__dreamBoardSdkPromise) return win.__dreamBoardSdkPromise;
        var promise = new Promise(function (resolve) {
            if (!win.document || !win.document.createElement) { resolve(false); return; }
            var script = win.document.createElement('script');
            script.src = SDK_SRC;
            script.integrity = SDK_INTEGRITY;
            script.crossOrigin = SDK_CROSS_ORIGIN;
            script.addEventListener('load', function () {
                resolve(!!(win.supabase && typeof win.supabase.createClient === 'function'));
            }, { once: true });
            script.addEventListener('error', function () { resolve(false); }, { once: true });
            (win.document.head || win.document.documentElement).appendChild(script);
        });
        win.__dreamBoardSdkPromise = promise;
        return promise;
    }

    function normalizeConfig(value) {
        var source = value && typeof value === 'object' ? value : {};
        return Object.freeze({
            authEnabled: source.authEnabled === true,
            supabaseUrl: String(source.supabaseUrl || '').trim(),
            supabasePublishableKey: String(source.supabasePublishableKey || '').trim(),
            turnstileSiteKey: String(source.turnstileSiteKey || '').trim(),
            requireCaptcha: source.requireCaptcha !== false
        });
    }

    function validateConfig(config) {
        if (!config.authEnabled) return { ok: true, disabled: true };
        var validUrl = false;
        try {
            var url = new URL(config.supabaseUrl);
            validUrl = url.protocol === 'https:' && /\.supabase\.co$/i.test(url.hostname);
        } catch (_) { validUrl = false; }
        if (!validUrl) return { ok: false, reason: 'invalid_url' };
        if (!PUBLIC_KEY_RE.test(config.supabasePublishableKey) || /secret|service.role/i.test(config.supabasePublishableKey)) {
            return { ok: false, reason: 'invalid_public_key' };
        }
        if (config.requireCaptcha && !config.turnstileSiteKey) return { ok: false, reason: 'captcha_not_configured' };
        return { ok: true, disabled: false };
    }

    function validateCredentials(email, password, needsPassword) {
        if (!EMAIL_RE.test(String(email || '').trim())) return 'Введите корректный email.';
        if (needsPassword && String(password || '').length < 8) return 'Пароль должен содержать не менее 8 символов.';
        return '';
    }

    function safeMessage(error, fallback) {
        var code = String(error && (error.code || error.name) || '').toLowerCase();
        if (code.indexOf('invalid_credentials') !== -1) return 'Неверный email или пароль.';
        if (code.indexOf('email_not_confirmed') !== -1) return 'Подтвердите email по ссылке из письма.';
        if (code.indexOf('over_request_rate_limit') !== -1) return 'Слишком много попыток. Попробуйте позже.';
        return fallback || 'Не удалось выполнить запрос. Попробуйте позже.';
    }

    function createAuthService(client, config, locationLike) {
        if (!client || !client.auth) throw new TypeError('Supabase auth client is required');
        var redirectTo = locationLike && locationLike.origin && locationLike.pathname
            ? locationLike.origin + locationLike.pathname : undefined;
        return Object.freeze({
            getSession: function () { return client.auth.getSession(); },
            onAuthStateChange: function (callback) { return client.auth.onAuthStateChange(callback); },
            signIn: function (email, password) {
                return client.auth.signInWithPassword({ email: String(email).trim(), password: String(password) });
            },
            signUp: function (email, password, captchaToken) {
                if (config.requireCaptcha && !captchaToken) return Promise.reject({ code: 'captcha_required' });
                return client.auth.signUp({
                    email: String(email).trim(),
                    password: String(password),
                    options: { emailRedirectTo: redirectTo, captchaToken: captchaToken || undefined }
                });
            },
            resetPassword: function (email, captchaToken) {
                if (config.requireCaptcha && !captchaToken) return Promise.reject({ code: 'captcha_required' });
                return client.auth.resetPasswordForEmail(String(email).trim(), {
                    redirectTo: redirectTo,
                    captchaToken: captchaToken || undefined
                });
            },
            updatePassword: function (password) { return client.auth.updateUser({ password: String(password) }); },
            signOut: function () { return client.auth.signOut({ scope: 'local' }); }
        });
    }

    function mountTurnstile(win, siteKey, container, tokenInput) {
        if (!win || !win.document || !siteKey || !container || !tokenInput) return Promise.resolve(false);
        function render() {
            if (!win.turnstile || typeof win.turnstile.render !== 'function') return false;
            win.turnstile.render(container, {
                sitekey: siteKey,
                theme: 'dark',
                callback: function (token) { tokenInput.value = String(token || ''); },
                'expired-callback': function () { tokenInput.value = ''; },
                'error-callback': function () { tokenInput.value = ''; }
            });
            return true;
        }
        if (win.turnstile) return Promise.resolve(render());
        return new Promise(function (resolve) {
            var script = win.document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.referrerPolicy = 'no-referrer';
            script.addEventListener('load', function () { resolve(render()); }, { once: true });
            script.addEventListener('error', function () { resolve(false); }, { once: true });
            (win.document.head || win.document.documentElement).appendChild(script);
        });
    }

    function setupAuthUi(win, config) {
        var button = win.document.getElementById('account-toggle-btn');
        var dialog = win.document.getElementById('auth-modal');
        var client = win.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        var service = createAuthService(client, config, win.location);
        var form = win.document.getElementById('auth-form');
        var email = win.document.getElementById('auth-email');
        var password = win.document.getElementById('auth-password');
        var message = win.document.getElementById('auth-message');
        var sessionPanel = win.document.getElementById('auth-session-panel');
        var sessionStatus = win.document.getElementById('auth-session-status');
        var signOut = win.document.getElementById('auth-signout-btn');
        var captchaInput = win.document.getElementById('auth-captcha-token');
        var captchaContainer = win.document.getElementById('auth-turnstile');
        var mode = 'signin';
        var opener = null;

        function setMessage(text, kind) {
            if (!message) return;
            message.textContent = text || '';
            message.dataset.kind = kind || '';
        }
        function setMode(next) {
            mode = next;
            if (password) password.hidden = next === 'reset';
            var submit = win.document.getElementById('auth-submit-btn');
            if (submit) submit.textContent = next === 'signup' ? 'Создать аккаунт' : next === 'reset' ? 'Отправить ссылку' : next === 'recovery' ? 'Сохранить новый пароль' : 'Войти';
            setMessage('', '');
        }
        function showSession(session) {
            var signedIn = !!(session && session.user);
            if (sessionPanel) sessionPanel.hidden = !signedIn;
            if (sessionStatus) sessionStatus.textContent = signedIn
                ? 'Выполнен вход: ' + String(session.user.email || 'аккаунт') + '. Синхронизация выключена.' : '';
            if (button) button.dataset.signedIn = signedIn ? 'true' : 'false';
        }
        function closeDialog() {
            if (dialog && dialog.open) dialog.close();
            if (opener && typeof opener.focus === 'function') opener.focus();
        }
        if (button && dialog) button.addEventListener('click', function () {
            opener = button;
            setMode('signin');
            dialog.showModal();
            if (email) email.focus();
        });
        var close = win.document.getElementById('auth-close-btn');
        if (close) close.addEventListener('click', closeDialog);
        if (dialog) dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
        ['signin', 'signup', 'reset'].forEach(function (name) {
            var control = win.document.querySelector('[data-auth-mode="' + name + '"]');
            if (control) control.addEventListener('click', function () { setMode(name); });
        });
        if (form) form.addEventListener('submit', function (event) {
            event.preventDefault();
            var mail = email ? email.value : '';
            var pass = password ? password.value : '';
            var invalid = validateCredentials(mail, pass, mode !== 'reset');
            if (invalid) return setMessage(invalid, 'error');
            var token = captchaInput ? captchaInput.value : '';
            var task = mode === 'signup' ? service.signUp(mail, pass, token)
                : mode === 'reset' ? service.resetPassword(mail, token)
                    : mode === 'recovery' ? service.updatePassword(pass)
                    : service.signIn(mail, pass);
            task.then(function (result) {
                if (result && result.error) throw result.error;
                setMessage(mode === 'reset' ? 'Проверьте почту.' : mode === 'signup' ? 'Проверьте почту для подтверждения.' : mode === 'recovery' ? 'Новый пароль сохранён.' : 'Вход выполнен. Синхронизация выключена.', 'success');
            }).catch(function (error) {
                if (error && error.code === 'captcha_required') setMessage('Подтвердите, что вы не робот.', 'error');
                else setMessage(safeMessage(error), 'error');
            });
        });
        if (signOut) signOut.addEventListener('click', function () {
            service.signOut().then(function (result) {
                if (result && result.error) throw result.error;
                showSession(null);
                setMessage('Вы вышли из аккаунта. Локальные данные сохранены.', 'success');
            }).catch(function (error) { setMessage(safeMessage(error), 'error'); });
        });
        service.getSession().then(function (result) { showSession(result && result.data && result.data.session); }).catch(function () {});
        service.onAuthStateChange(function (event, session) {
            showSession(session);
            if (event === 'PASSWORD_RECOVERY') {
                setMode('recovery');
                if (dialog && !dialog.open) dialog.showModal();
                if (password) password.focus();
            }
        });
        if (config.requireCaptcha) mountTurnstile(win, config.turnstileSiteKey, captchaContainer, captchaInput);
        return { enabled: true, ready: true, client: client, service: service };
    }

    function initBrowser(env) {
        var win = env || (typeof window !== 'undefined' ? window : null);
        if (!win || !win.document) return { enabled: false };
        var config = normalizeConfig(win.DreamBoardConfig);
        var button = win.document.getElementById('account-toggle-btn');
        if (!config.authEnabled) return { enabled: false };
        if (button) button.hidden = false;
        var check = validateConfig(config);
        if (!check.ok) {
            if (button) {
                button.disabled = true;
                button.title = 'Аккаунт временно недоступен';
            }
            return { enabled: true, ready: false, reason: check.reason };
        }
        // Dynamic, fail-closed SDK load: no script tag is created unless auth is
        // enabled AND the configuration is valid. Errors resolve to false and
        // degrade to a disabled button — never an exception.
        loadSupabaseSdk(win).then(function (loaded) {
            if (!loaded || !win.supabase || typeof win.supabase.createClient !== 'function') {
                if (button) {
                    button.disabled = true;
                    button.title = 'Аккаунт временно недоступен';
                }
                return;
            }
            setupAuthUi(win, config);
        });
        return { enabled: true, ready: 'pending' };
    }

    var api = Object.freeze({
        normalizeConfig: normalizeConfig,
        validateConfig: validateConfig,
        validateCredentials: validateCredentials,
        safeMessage: safeMessage,
        createAuthService: createAuthService,
        mountTurnstile: mountTurnstile,
        loadSupabaseSdk: loadSupabaseSdk,
        initBrowser: initBrowser
    });
    if (typeof window !== 'undefined' && window.document) {
        window.addEventListener('DOMContentLoaded', function () { initBrowser(window); }, { once: true });
    }
    return api;
});
