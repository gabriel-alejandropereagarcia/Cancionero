import subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright

PORT = 3198
env = {**os.environ, 'PORT': str(PORT)}
srv = subprocess.Popen(['node', 'test/mock-server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1.2)
URL = f'http://localhost:{PORT}/'
fails, passes = [], 0

def check(name, cond, extra=''):
    global passes
    if cond: passes += 1; print('  ✓', name)
    else: fails.append(name); print('  ✗', name, extra)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        page.goto(URL)

        # --- búsqueda ---
        check('home visible, sin recientes', page.is_visible('#home') and page.is_hidden('#recentsTitle'))
        page.fill('#q', 'falla'); page.click('#search button')
        page.wait_for_function("document.getElementById('status').textContent.length > 0 && !document.getElementById('status').textContent.startsWith('Buscando')")
        check('error de búsqueda se muestra', 'Cifra Club' in page.inner_text('#status') or 'respondió' in page.inner_text('#status'), page.inner_text('#status'))
        page.fill('#q', 'a'); page.click('#search button')
        check('query corta avisa', 'al menos 2' in page.inner_text('#status'), page.inner_text('#status'))
        page.fill('#q', 'tema'); page.click('#search button')
        page.wait_for_selector('#results li')
        items = page.eval_on_selector_all('#results li button', 'els => els.map(e => e.firstChild.textContent)')
        check('resultados: artista + canciones', items == ['Banda Demo', 'Tema Uno', 'Otro Tema'], str(items))
        page.click('#results li:first-child button')
        page.wait_for_function("document.getElementById('status').textContent.startsWith('Más populares')")
        items = page.eval_on_selector_all('#results li button', 'els => els.map(e => e.firstChild.textContent)')
        check('artista → canciones populares', items == ['Tema Uno', 'Tema Dos', 'Extremo'], str(items))

        # --- línea imposible de achicar: se parte, no hay scroll lateral ---
        page.click('#results li:nth-child(3) button')
        page.wait_for_selector('#player:not([hidden])')
        m = page.evaluate("""() => { const s = document.getElementById('song'); return {sw: s.scrollWidth, cw: s.clientWidth, fs: parseFloat(getComputedStyle(s).fontSize), docW: document.documentElement.scrollWidth, vw: innerWidth}; }""")
        check('línea extrema: se parte y no hay scroll lateral', m['sw'] <= m['cw'] + 1 and m['docW'] <= m['vw'] + 1, str(m))
        check('línea extrema: letra mínima 12px', m['fs'] == 12, str(m))
        page.go_back(); page.wait_for_selector('#home:not([hidden])')

        # --- reproductor ---
        page.click('#results li:first-child button')
        page.wait_for_selector('#player:not([hidden])')
        check('reproductor abre y oculta el home', page.is_hidden('#home'))
        check('título y artista', page.inner_text('#songTitle') == 'Tema Uno' and page.inner_text('#songSource') == 'Banda Demo')
        m = page.evaluate("""() => { const s = document.getElementById('song'); return {sw: s.scrollWidth, cw: s.clientWidth, fs: parseFloat(getComputedStyle(s).fontSize), docW: document.documentElement.scrollWidth, vw: innerWidth}; }""")
        check('sin scroll horizontal (letra ajustada al ancho)', m['sw'] <= m['cw'] + 1 and m['docW'] <= m['vw'] + 1, str(m))
        check('tamaño de letra legible (>=12px)', m['fs'] >= 12, str(m))
        kinds = page.eval_on_selector_all('#song div', 'els => els.map(e => e.className || "lyric")')
        check('acordes y secciones con estilo', 'chord' in kinds and 'section' in kinds)
        solo = page.evaluate("[...document.querySelectorAll('#song div')].find(d => d.textContent.startsWith('Solo quiero')).className")
        check('"Solo quiero…" es letra, no sección', solo == '', repr(solo))
        chord_color = page.evaluate("getComputedStyle(document.querySelector('#song .chord')).color")
        check('acordes en amarillo', chord_color == 'rgb(255, 210, 74)', chord_color)

        # --- autoscroll ---
        y0 = page.evaluate('scrollY')
        page.click('#play')
        page.wait_for_timeout(1500)
        y1 = page.evaluate('scrollY')
        check('scroll automático avanza', y1 > y0 + 20, f'{y0} → {y1}')
        check('botón pasa a pausa', page.inner_text('#play') == '⏸')
        page.click('#play'); y2 = page.evaluate('scrollY'); page.wait_for_timeout(600)
        check('pausa frena el scroll', abs(page.evaluate('scrollY') - y2) < 2)
        # velocidad: más rápido recorre más en el mismo tiempo
        def run(clicks, key):
            page.evaluate('scrollTo(0,0)')
            for _ in range(abs(clicks)): page.click(key)
            a = page.evaluate('scrollY'); page.click('#play'); page.wait_for_timeout(1000); page.click('#play')
            return page.evaluate('scrollY') - a
        slow = run(3, '#slower'); label_slow = page.inner_text('#speedLabel')
        fast = run(8, '#faster'); label_fast = page.inner_text('#speedLabel')
        check('+/− cambian velocidad real', fast > slow * 1.5, f'lento {slow}px/s, rápido {fast}px/s')
        check('etiqueta de velocidad cambia', label_slow != label_fast, f'{label_slow} vs {label_fast}')
        # límites
        for _ in range(60): page.click('#faster')
        check('velocidad máxima acotada', int(page.inner_text('#speedLabel')) <= 20)
        for _ in range(80): page.click('#slower')
        check('velocidad mínima acotada', int(page.inner_text('#speedLabel')) >= 1)
        # tocar la letra alterna
        page.click('#song div:nth-child(5)'); check('tocar la letra reproduce', page.inner_text('#play') == '⏸')
        page.click('#song div:nth-child(5)'); check('tocar de nuevo pausa', page.inner_text('#play') == '▶')
        # llegar al final: se frena sola
        for _ in range(60): page.click('#faster')
        page.evaluate('scrollTo(0,0)'); page.click('#play')
        page.wait_for_function("document.getElementById('play').textContent === '▶'", timeout=60000)
        end = page.evaluate('innerHeight + scrollY >= document.documentElement.scrollHeight - 2')
        check('se frena sola al llegar al final', end)
        page.click('#play'); page.wait_for_timeout(400)
        check('play al final reinicia desde arriba', page.evaluate('scrollY') < page.evaluate('document.documentElement.scrollHeight') - 900 and page.inner_text('#play') == '⏸')
        page.click('#play')

        # tamaño de letra manual
        page.evaluate('scrollTo(0, 600)')
        fs0 = page.evaluate("parseFloat(getComputedStyle(document.getElementById('song')).fontSize)")
        ratio0 = page.evaluate('scrollY / document.documentElement.scrollHeight')
        page.click('#fontUp'); page.click('#fontUp')
        fs1 = page.evaluate("parseFloat(getComputedStyle(document.getElementById('song')).fontSize)")
        ratio1 = page.evaluate('scrollY / document.documentElement.scrollHeight')
        check('A+ agranda la letra', fs1 == fs0 + 4, f'{fs0} → {fs1}')
        check('A+ mantiene el lugar en la canción', abs(ratio1 - ratio0) < 0.02, f'{ratio0:.3f} → {ratio1:.3f}')
        check('A+ queda guardado', page.evaluate("localStorage.getItem('cancionero.font')") == str(int(fs1)))
        for _ in range(30): page.click('#fontDown')
        fs2 = page.evaluate("parseFloat(getComputedStyle(document.getElementById('song')).fontSize)")
        check('A− tiene piso (10px)', fs2 == 10, str(fs2))
        for _ in range(30): page.click('#fontUp')
        fs3 = page.evaluate("parseFloat(getComputedStyle(document.getElementById('song')).fontSize)")
        check('A+ tiene techo (40px)', fs3 == 40, str(fs3))
        m = page.evaluate("() => { const s = document.getElementById('song'); return s.scrollWidth <= s.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }")
        check('letra gigante: sin scroll lateral', m)
        for _ in range(8): page.click('#fontDown')
        page.evaluate("localStorage.removeItem('cancionero.font')")

        # velocidad persiste y "atrás"
        saved = page.evaluate("localStorage.getItem('cancionero.speed')")
        check('velocidad guardada', saved is not None)
        page.go_back()
        page.wait_for_selector('#home:not([hidden])')
        check('botón atrás vuelve a la lista', page.is_hidden('#player') and page.evaluate("document.querySelectorAll('#results li').length") == 3)

        # --- recientes y sin conexión ---
        page.reload()
        page.wait_for_selector('#recents li')
        check('reciente guardada tras recargar', page.text_content('#recentsTitle') == 'Recientes' and page.locator('#recents li').count() == 2)
        page.evaluate("navigator.serviceWorker.ready.then(()=>true)")
        page.wait_for_timeout(800)
        ctx.set_offline(True)
        page.reload()
        page.wait_for_selector('#recents li')
        check('la app abre sin conexión (service worker)', page.is_visible('#home'))
        page.click('#recents li button')
        page.wait_for_selector('#player:not([hidden])')
        check('reciente abre sin conexión', page.inner_text('#songTitle') == 'Tema Uno')
        page.go_back()
        page.fill('#q', 'tema'); page.click('#search button')
        page.wait_for_function("document.getElementById('status').textContent.length > 0 && document.getElementById('status').textContent !== 'Buscando…'")
        check('búsqueda offline avisa "Sin conexión"', page.inner_text('#status') == 'Sin conexión', page.inner_text('#status'))
        ctx.set_offline(False)

        # --- horizontal: se reajusta al girar el celu ---
        page.reload(); page.wait_for_selector('#recents li'); page.click('#recents li button'); page.wait_for_selector('#player:not([hidden])')
        fs_portrait = page.evaluate("parseFloat(getComputedStyle(document.getElementById('song')).fontSize)")
        page.set_viewport_size({'width': 844, 'height': 390}); page.wait_for_timeout(300)
        fs_land = page.evaluate("parseFloat(getComputedStyle(document.getElementById('song')).fontSize)")
        check('al girar a horizontal la letra se reajusta', fs_land > fs_portrait, f'{fs_portrait} → {fs_land}')
        ov = page.evaluate("document.getElementById('song').scrollWidth <= document.getElementById('song').clientWidth + 1")
        check('horizontal sin scroll lateral', ov)

        check('sin errores de JavaScript en consola', not errors, str(errors))
        page.screenshot(path='/tmp/ui-landscape.png')
        page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(300)
        page.screenshot(path='/tmp/ui-player.png')
        b.close()
finally:
    srv.kill()

print(f'\nUI: {passes} OK, {len(fails)} fallos', fails)
sys.exit(1 if fails else 0)
