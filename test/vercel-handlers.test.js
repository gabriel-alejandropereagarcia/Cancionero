// Prueba los handlers serverless de Vercel (api/*.js) con Cifra Club simulado.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

process.env.PORT = '0';
// Reusa el simulador, pero sin levantar el servidor local
const src = await (await import('node:fs/promises')).readFile('test/mock-server.js', 'utf8');
const mockOnly = src.replace("await import('../server.js');", '');
await import('data:text/javascript;base64,' + Buffer.from(mockOnly).toString('base64'));

const call = async (file, query) => {
  const h = (await import(pathToFileURL(resolve('api', file)).href)).default;
  const res = { headers: {}, code: 200, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await h({ query }, res);
  return res;
};

let r = await call('search.js', { q: 'tema' });
assert.equal(r.code, 200);
assert.equal(r.body.results.length, 3);
assert.match(r.headers['Cache-Control'], /s-maxage/);

r = await call('search.js', { q: 'x' });
assert.equal(r.code, 400);
assert.equal(r.headers['Cache-Control'], undefined);

r = await call('search.js', { q: 'falla' });
assert.equal(r.code, 502);
assert.equal(r.headers['Cache-Control'], undefined, 'los errores no se cachean');

r = await call('song.js', { url: 'https://www.cifraclub.com/banda-demo/tema-uno/' });
assert.equal(r.code, 200);
assert.equal(r.body.title, 'Tema Uno');
assert.ok(r.headers['Cache-Control']);

r = await call('song.js', { url: 'https://evil.com/' });
assert.equal(r.code, 502);
assert.equal(r.headers['Cache-Control'], undefined);

r = await call('song.js', {});
assert.equal(r.code, 502);

r = await call('artist.js', { slug: 'banda-demo', name: 'Banda Demo' });
assert.equal(r.code, 200);
assert.equal(r.body.results.length, 3);

r = await call('artist.js', { slug: '../x' });
assert.equal(r.code, 502);

// Cifra Club bloquea a Vercel con 403 → debe usar el lector alternativo
globalThis.__BLOCK = true;
r = await call('song.js', { url: 'https://www.cifraclub.com/banda-demo/tema-uno/' });
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.equal(r.body.title, 'Tema Uno');
assert.ok(r.body.lines.some((l) => l.t === 'chord'));
r = await call('artist.js', { slug: 'banda-demo', name: 'Banda Demo' });
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.equal(r.body.results.length, 3);

// Bloqueado y el lector también caído → error claro y sin caché
globalThis.__JINA_DOWN = true;
r = await call('song.js', { url: 'https://www.cifraclub.com/banda-demo/tema-uno/' });
assert.equal(r.code, 502);
assert.match(r.body.error, /bloque/);
assert.equal(r.headers['Cache-Control'], undefined);
// un 404 normal NO debe ir al lector
globalThis.__BLOCK = false; globalThis.__JINA_DOWN = false;
r = await call('song.js', { url: 'https://www.cifraclub.com/no/existe/' });
assert.equal(r.code, 502);
assert.match(r.body.error, /404/);

console.log('Handlers de Vercel: OK');
process.exit(0);
