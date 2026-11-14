import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchSongs, fetchSong } from './lib/sources.js';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': TYPES['.json'] });
  res.end(JSON.stringify(data));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
        if (q.length < 2) return json(res, 400, { error: 'Escribí al menos 2 letras' });
        return json(res, 200, { results: await searchSongs(q) });
      }
      if (url.pathname === '/api/song') {
        return json(res, 200, await fetchSong(url.searchParams.get('url') || ''));
      }
      const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
      if (rel.includes('..')) return json(res, 400, { error: 'Ruta inválida' });
      const data = await readFile(join(PUBLIC, rel));
      res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      if (e.code === 'ENOENT') return json(res, 404, { error: 'No encontrado' });
      json(res, 502, { error: e.message });
    }
  })
  .listen(PORT, () => console.log(`Cancionero en http://localhost:${PORT}`));
