'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('./auth.js');
test('перенос авторизации: вход и reset требуют CAPTCHA и передают токен', async () => {
    const calls=[];
    const service=auth.createAuthService({auth:{
        signInWithPassword(value) { calls.push(value); return Promise.resolve({}); },
        resetPasswordForEmail(email,options) { calls.push({email,options}); return Promise.resolve({}); }
    }},{requireCaptcha:true},{origin:'https://example.com',pathname:'/dreamboard/'});
    await assert.rejects(service.signIn('a@example.com','password',''),e=>e.code==='captcha_required');
    await assert.rejects(service.resetPassword('a@example.com',''),e=>e.code==='captcha_required');
    assert.equal(calls.length,0);
    await service.signIn(' a@example.com ','password','token-signin');
    await service.resetPassword(' a@example.com ','token-reset');
    assert.equal(calls[0].options.captchaToken,'token-signin');
    assert.equal(calls[1].options.captchaToken,'token-reset');
    assert.equal(calls[1].options.redirectTo,'https://example.com/dreamboard/');
    assert.ok(calls.every(c=>c.email==='a@example.com'));
});
