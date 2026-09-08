const test = require('node:test');
const assert = require('node:assert/strict');
const { outputSize, positions, wrap, printDensity } = require('./png-export.js');
test('экранный PNG укладывается в ограничение памяти, A2 имеет печатные размеры', () => {
    for (const [w,h] of [[1080,900],[5000,20000],[10000,1000]]) {
        const out=outputSize(w,h); assert.ok(out.width<=4096 && out.height<=4096); assert.ok(out.width*out.height<=12000000);
    }
    assert.equal(outputSize(1000,2000,'a2').width,2480);
    assert.equal(outputSize(1000,2000,'a2-hq').height,7016);
});
test('свободный холст сохраняет расстояния и оставляет поле подписи', () => {
    const cards=[{x:-500,y:400,width:320,height:420},{x:100,y:700,width:400,height:500}];
    const result=positions(cards,'canvas',3);
    assert.equal(cards[1].x-cards[0].x,600); assert.equal(cards[1].y-cards[0].y,300);
    assert.ok(result.height-(cards[1].y+cards[1].height)>=76);
});
test('перенос длинного слова и явной новой строки не теряет символы', () => {
    const ctx={measureText:s=>({width:s.length*10})};
    assert.deepEqual(wrap(ctx,'abcdef\nxy',30),['abc','def','xy']);
});
test('плотность печати вставляется после IHDR и заменяет прежнюю', () => {
    const input=new Uint8Array(66); new DataView(input.buffer).setUint32(33,9); input.set([112,72,89,115],37);
    new DataView(input.buffer).setUint32(54,0); input.set([73,69,78,68],58);
    const parts=printDensity(input,300);
    assert.equal(parts.length,3); assert.equal(new DataView(parts[1].buffer).getUint32(8),11811); assert.equal(parts[1][16],1);
    assert.equal(parts[2].length,12);
});
