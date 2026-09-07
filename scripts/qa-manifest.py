import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('qa-manifest')
OUT.mkdir(exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for name,w,h,mobile,reduced in [('phone-portrait',390,844,True,False),('phone-landscape',800,360,True,False),('small-phone',320,568,True,False),('short-landscape',640,200,True,False),('tablet',1024,768,True,False),('desktop',1440,900,False,False),('reduced-motion',390,844,True,True)]:
        context = browser.new_context(viewport={'width':w,'height':h},is_mobile=mobile,has_touch=mobile,reduced_motion='reduce' if reduced else 'no-preference',service_workers='block')
        page = context.new_page()
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.add_init_script('''
            Element.prototype.requestFullscreen = () => Promise.reject(new Error('QA: unsupported fullscreen'));
            Object.defineProperty(navigator, 'deviceMemory', {get: () => 4});
            window.audioAudit = {oscillators: [], gains: []};
            const OriginalAudio = window.AudioContext;
            window.AudioContext = class extends OriginalAudio {
                createOscillator() { const n=super.createOscillator(); window.audioAudit.oscillators.push(n); return n; }
                createGain() { const n=super.createGain(); window.audioAudit.gains.push(n); return n; }
            };
        ''')
        page.goto(os.environ.get('DREAMBOARD_QA_URL', 'http://127.0.0.1:8765/'))
        page.wait_for_timeout(300)
        page.evaluate("document.getElementById('start-manifest-btn').click()")
        page.wait_for_timeout(500)
        assert page.locator('.manifest-overlay').evaluate("e=>e.classList.contains('active')")
        if mobile: assert page.locator('html').evaluate("e=>e.classList.contains('performance-lite')")
        data=page.evaluate('''() => {
            const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right}};
            return {guide:box('.breath-guide-container'),circle:box('.breath-circle-inner'),board:box('.manifest-content'),caption:box('#breath-text'),animation:getComputedStyle(document.querySelector('.breath-circle-inner')).animationName};
        }''')
        assert data['guide']['bottom'] <= data['board']['y'], (name,data)
        assert data['circle']['w'] >= 30, (name,data)
        assert data['circle']['right'] < data['caption']['x'], (name,data)
        if reduced: assert data['animation']=='none'
        else: assert data['animation']=='breath-expand'
        assert page.locator('.manifest-slide.active img').evaluate('e=>e.complete && e.naturalWidth>0')
        # Доски листаются; пауза относится к слайдам, а дыхание продолжается.
        title=page.locator('#manifest-title').inner_text()
        page.locator('#manifest-next-btn').click()
        assert page.locator('#manifest-title').inner_text()!=title
        page.locator('#manifest-play-btn').click()
        assert 'Продолжить' in page.locator('#manifest-play-btn').get_attribute('aria-label')
        page.locator('#manifest-audio-btn').click()
        assert page.locator('#manifest-audio-btn').get_attribute('aria-pressed')=='true'
        assert page.evaluate('audioAudit.oscillators.length')==4
        assert page.evaluate("audioAudit.oscillators.every(o=>o.type==='sine')")
        page.locator('#manifest-audio-btn').click()
        assert page.locator('#manifest-audio-btn').get_attribute('aria-pressed')=='false'
        page.locator('#manifest-audio-btn').click()
        assert page.evaluate('audioAudit.oscillators.length')==8
        # Проверяем реальные фазы таймера и соответствующую CSS-анимацию.
        if name=='phone-portrait':
            page.clock.install()
            page.evaluate("document.getElementById('exit-manifest-btn').click(); document.getElementById('start-manifest-btn').click()")
            for expected in ['hold','exhale','breath-circle-inner','inhale']:
                page.clock.run_for(4000)
                actual=page.locator('.breath-circle-inner').get_attribute('class')
                assert expected in actual,(expected,actual)
            page.clock.resume()
        page.locator('.manifest-overlay').evaluate('e=>e.scrollTop=0')
        page.screenshot(path=str(OUT/(name+'.png')))
        page.evaluate("document.getElementById('exit-manifest-btn').click()")
        assert not page.locator('.manifest-overlay').evaluate("e=>e.classList.contains('active')")
        assert not errors,(name,errors)
        results.append({'viewport':name,'size':[w,h],'pass':True,'geometry':data})
        print(name,'PASS',flush=True)
        context.close()
    browser.close()
OUT.joinpath('browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
