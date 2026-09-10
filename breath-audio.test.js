'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
    const voices = [], gains = [];
    let resolveFetch, fetches = 0;
    const request = new Promise(resolve => { resolveFetch = resolve; });
    const c = {
        isSoundOn: true, ambientSynth: null, document: { hidden: false },
        breathCircle: { classList: { contains: name => name === c.phase } },
        phase: 'inhale', initAudioContext() {}, showToast() {},
        fetch() { fetches++; return request; },
        audioToggleBtn: { click() { c.isSoundOn=false; c.stopManifestationMusic(); } },
        audioCtx: {
            currentTime: 10, destination: {}, decodeAudioData: async () => ({ duration: 9 }),
            createGain() {
                const node = { disconnected: false, connect() {}, disconnect() { this.disconnected=true; },
                    gain: { value: 0, targets: [], setValueAtTime(v) { this.value=v; }, cancelAndHoldAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime(v,t) { this.targets.push([v,t]); } } };
                gains.push(node); return node;
            },
            createBufferSource() {
                const node = { connect() {}, disconnect() {}, start(t,offset) { this.offset=offset; }, stop(t) { this.stopAt=t; } };
                voices.push(node); return node;
            }
        }
    };
    vm.createContext(c);
    vm.runInContext(source.slice(source.indexOf('    let meditationBellBufferPromise'), source.indexOf('    function setupAudioToggle()')),c);
    return { c, voices, gains, fetches: () => fetches,
        loaded: () => resolveFetch({ ok:true, arrayBuffer:async () => new ArrayBuffer(8) }),
        failed: () => resolveFetch({ ok:false }) };
}
test('selected bell plays on inhale/exhale, not hold or duplicate updates', async () => {
    const h=harness(), c=h.c;
    c.startManifestationMusic(); h.loaded(); await flush();
    assert.equal(h.voices.length,1); assert.equal(h.voices[0].offset,.25);
    c.updateBreathingSound(); c.phase='hold'; c.updateBreathingSound(); assert.equal(h.voices.length,1);
    c.phase='exhale'; c.updateBreathingSound(); assert.equal(h.voices.length,2); assert.equal(h.gains.at(-1).gain.value,.8);
});
test('mute/hidden suppress loading; stop during download prevents delayed playback', async () => {
    const h=harness(), c=h.c;
    c.isSoundOn=false; c.startManifestationMusic(); c.isSoundOn=true; c.document.hidden=true; c.startManifestationMusic();
    assert.equal(h.fetches(),0);
    c.document.hidden=false; c.startManifestationMusic(); c.stopManifestationMusic(); h.loaded(); await flush();
    assert.equal(h.voices.length,0); assert.equal(c.ambientSynth,null);
});
test('rapid restart reuses buffer; old ending cannot stop the new sound', async () => {
    const h=harness(), c=h.c;
    c.startManifestationMusic(); h.loaded(); await flush(); c.stopManifestationMusic();
    assert.equal(h.voices[0].stopAt,10.3);
    c.startManifestationMusic(); await flush(); const current=c.ambientSynth; h.voices[0].onended();
    assert.equal(c.ambientSynth,current); assert.ok(h.gains[0].disconnected);
    assert.equal(h.voices[1].stopAt,undefined); assert.equal(h.fetches(),1);
});
test('download failure resets the sound control', async () => {
    const h=harness(), c=h.c;
    c.startManifestationMusic(); h.failed(); await flush();
    assert.equal(c.ambientSynth,null); assert.equal(c.isSoundOn,false); assert.equal(h.voices.length,0);
});
test('older audio engines fade out and release voices', async () => {
    const h=harness(), c=h.c;
    c.startManifestationMusic(); h.loaded(); await flush(); delete h.gains[0].gain.cancelAndHoldAtTime;
    c.stopManifestationMusic(); assert.deepEqual(h.gains[0].gain.targets.at(-1),[0,10.25]);
    h.voices[0].onended(); assert.ok(h.gains[0].disconnected);
});
