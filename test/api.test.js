import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 3199;
const base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['test/mock-server.js'], { env: { ...process.env, PORT }, stdio: 'pipe' });
await new Promise((res, rej) => {
  srv.stdout.on('data', (d) => String(d).includes('Cancionero en') && res());
  srv.stderr.on('data', (d) => rej(new Error(String(d))));
  setTimeout(() => rej(new Error('el servidor no arrancó')), 5000);
});

const get = async (p) => {
  const r = await fetch(base + p);
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, ct, body: ct.includes('json') ? await r.json() : await r.text() };
};
let n = 0;
const ok = (name, fn) => fn().then(() => { n++; console.log('  ✓', name); });

try {
  await ok('sirve la interfaz y los archivos de la PWA', async () => {
    for (const [p, type] of [['/', 'text/html'], ['/app.js', 'javascript'], ['/style.css', 'css'], ['/sw.js', 'javascript'], ['/manifest.json', 'json'], ['/icon-192.png', 'png']]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.ok(r.ct.includes(type), `${p} → ${r.ct}`);
    }
  });
  await ok('búsqueda: junta rápido + completo, sin repetidos ni álbumes', async () => {
    const r = await get('/api/search?q=tema');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.results.map((x) => `${x.kind}:${x.title}`), ['artist:Banda Demo', 'song:Tema Uno', 'song:Otro Tema']);
    assert.equal(r.body.results[0].artist, 'Artista · 120 canciones');
  });
  await ok('búsqueda: query corta → 400; vacía → lista vacía; ambos buscadores caídos → 502', async () => {
    assert.equal((await get('/api/search?q=a')).status, 400);
    assert.deepEqual((await get('/api/search?q=vacio')).body.results, []);
    const f = await get('/api/search?q=falla');
    assert.equal(f.status, 502);
    assert.ok(f.body.error);
  });
  await ok('artista: canciones populares en orden', async () => {
    const r = await get('/api/artist?slug=banda-demo&name=Banda%20Demo');
    assert.deepEqual(r.body.results.map((x) => x.title), ['Tema Uno', 'Tema Dos', 'Extremo']);
    assert.equal((await get('/api/artist?slug=../etc')).status, 502);
    assert.equal((await get('/api/artist?slug=no-existe')).status, 502);
  });
  await ok('canción: acordes, secciones, sin tablaturas ni caracteres invisibles', async () => {
    const r = await get('/api/song?url=' + encodeURIComponent('https://www.cifraclub.com/banda-demo/tema-uno/'));
    assert.equal(r.status, 200);
    const { title, artist, lines } = r.body;
    assert.equal(title, 'Tema Uno');
    assert.equal(artist, 'Banda Demo');
    assert.ok(lines.filter((l) => l.t === 'chord').length > 20);
    assert.ok(lines.some((l) => l.t === 'section' && l.text === '[Verso 2]'));
    assert.ok(!lines.some((l) => /^[A-G]\|/.test(l.text)), 'sin tablaturas');
    assert.ok(lines.every((l) => !/[​]/.test(l.text)), 'sin ZWSP');
    const solo = lines.find((l) => l.text.startsWith('Solo quiero'));
    assert.equal(solo.t, 'lyric');
  });
  await ok('canción: rechaza URLs ajenas, inválidas, 404 y páginas sin letra', async () => {
    for (const u of ['https://evil.com/x', 'http://www.cifraclub.com/a/b/', 'file:///etc/passwd', 'nada', '', 'https://www.cifraclub.com.evil.com/a/b/', 'https://www.cifraclub.com/banda-demo/sin-pre/', 'https://www.cifraclub.com/no/existe/']) {
      const r = await get('/api/song?url=' + encodeURIComponent(u));
      assert.equal(r.status, 502, u);
      assert.ok(r.body.error, u);
    }
  });
  await ok('estáticos: sin path traversal y 404 en JSON', async () => {
    assert.equal((await get('/nada.js')).status, 404);
    const t = await fetch(base + '/%2e%2e/package.json');
    assert.ok([400, 404].includes(t.status), String(t.status));
    const r = await fetch(base + '/../package.json');
    assert.ok([400, 404, 200].includes(r.status));
    assert.ok(!(await (await fetch(base + '/..%2fpackage.json')).text()).includes('"name": "cancionero"'));
  });
  console.log(`API: ${n} grupos de pruebas OK`);
} finally {
  srv.kill();
}
