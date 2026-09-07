'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness() {
    const oscillators = [], gains = [];
    const context = {
        isSoundOn: true, ambientSynth: null, document: { hidden: false },
        breathCircle: { classList: { contains: name => name === context.phase } },
        phase: 'inhale', initAudioContext() {},
        audioCtx: {
            currentTime: 10, destination: {},
            createGain() {
                const node = { disconnected: false, connect() {}, disconnect() { this.disconnected = true; },
                    gain: { value: 0, targets: [], setValueAtTime(v) { this.value=v; }, cancelAndHoldAtTime() {}, linearRampToValueAtTime(v,t) { this.targets.push([v,t]); } } };
                gains.push(node); return node;
            },
            createOscillator() {
                const node = { frequency: {}, connect() {}, disconnect() {}, start() {}, stop(t) { this.stopAt=t; } };
                oscillators.push(node); return node;
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('    function startManifestationMusic()'),source.indexOf('    function setupAudioToggle()')),context);
    return { context, oscillators, gains };
}
test('дыхательный звук: четыре синуса, громкость следует вдоху и выдоху', () => {
    const {context:c,oscillators,gains}=harness();
    c.startManifestationMusic();
    assert.deepEqual(oscillators.map(o=>o.frequency.value),[130.81,261.63,329.63,392]);
    assert.ok(oscillators.every(o=>o.type==='sine'));
    assert.deepEqual(gains[0].gain.targets.at(-1),[0.65,14]);
    c.phase='exhale'; c.updateBreathingSound();
    assert.deepEqual(gains[0].gain.targets.at(-1),[0.20,14]);
});
test('mute и скрытая вкладка не создают звук; повторный start не дублирует осцилляторы', () => {
    const {context:c,oscillators}=harness();
    c.isSoundOn=false; c.startManifestationMusic(); assert.equal(oscillators.length,0);
    c.isSoundOn=true; c.document.hidden=true; c.startManifestationMusic(); assert.equal(oscillators.length,0);
    c.document.hidden=false; c.startManifestationMusic(); c.startManifestationMusic(); assert.equal(oscillators.length,4);
});
test('быстрое выключение и включение: завершение старого звука не останавливает новый', () => {
    const {context:c,oscillators,gains}=harness();
    c.startManifestationMusic(); c.stopManifestationMusic();
    assert.equal(c.ambientSynth,null);
    assert.ok(oscillators.every(o=>o.stopAt===10.3));
    c.startManifestationMusic(); const current=c.ambientSynth;
    oscillators[0].onended();
    assert.equal(c.ambientSynth,current);
    assert.ok(gains[0].disconnected);
    assert.ok(oscillators.slice(4).every(o=>o.stopAt===undefined));
});
test('старый браузер без cancelAndHoldAtTime сохраняет текущую громкость', () => {
    const {context:c,gains}=harness();
    c.startManifestationMusic();
    const param=gains[0].gain;
    delete param.cancelAndHoldAtTime;
    let cancelled=false; param.cancelScheduledValues=()=>{cancelled=true;}; param.value=.3;
    c.phase='exhale'; c.updateBreathingSound();
    assert.ok(cancelled); assert.equal(param.value,.3);
    c.stopManifestationMusic(); assert.equal(c.ambientSynth,null);
});
