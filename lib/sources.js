// Búsqueda y extracción de canciones con acordes desde Cifra Club.
//
// - Búsqueda: endpoint JSON propio de Cifra Club (el mismo que usa su buscador).
// - Canción: la página tiene un único <pre> con la letra; los acordes vienen en <b>.
//   Las líneas llevan caracteres invisibles (U+200B) y hay bloques de tablatura.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HOSTS = ['www.cifraclub.com', 'cifraclub.com', 'm.cifraclub.com'];
const SEARCH = 'https://solr.sscdn.co/cifraclub-explore/v1/search/suggest';

// ---------- Clasificación de líneas ----------

// Acorde: raíz + modificadores (m, M, 7M, maj7, °, º, ø, +, sus4, add9, 7(9), b5…) + bajo opcional.
const CHORD = new RegExp(
  '^[A-G][#b]?' +
    '(?:maj|min|dim|aug|sus|add|alt|[mM°º+ø-]|\\d+|[#b]\\d+|\\([^)\\s]*\\))*' +
    '(?:/[A-G][#b]?)?$'
);
const FILLER = /^(?:[|\-–—:.()\[\]/*]+|x\d+|\d+x|\(?\d+x\)?|N\.?C\.?|%)$/i;
const TAB = /^\s*[A-Ga-g]?[#b]?\|[-\dhpbrx/\\~^()|\s.*]+$/;
const SECTION =
  /^\s*(?:\[[^\]]+\]|(?:intro|introducci[oó]n|estribillo|coro|verso|puente|solo|outro|final|pre[- ]?coro|interludio|primera parte|segunda parte|tercera parte)\b[^a-záéíóúñ]{0,20}.{0,15}:?)\s*$/i;

export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const t of tokens) {
    if (CHORD.test(t)) chords++;
    else if (!FILLER.test(t)) return false;
  }
  return chords > 0;
}

export function isTabLine(line) {
  return TAB.test(line);
}

// Convierte el texto plano de la canción en líneas tipadas.
// Quita tablaturas (no sirven para cantar) y colapsa líneas en blanco repetidas.
export function classify(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const t = raw.replace(/[​-‍﻿]/g, '').replace(/\s+$/, '');
    if (isTabLine(t)) continue;
    if (!t.trim()) {
      if (out.length && out.at(-1).t !== 'blank') out.push({ t: 'blank', text: '' });
      continue;
    }
    if (isChordLine(t)) out.push({ t: 'chord', text: t });
    else if (SECTION.test(t) && t.trim().length < 40) out.push({ t: 'section', text: t.trim() });
    else out.push({ t: 'lyric', text: t });
  }
  while (out.length && out[0].t === 'blank') out.shift();
  while (out.length && out.at(-1).t === 'blank') out.pop();
  return out;
}

// ---------- HTML -> texto ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function parseSongHtml(html) {
  const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => m[1]);
  if (!pres.length) throw new Error('No encontré letra con acordes en esa página');
  const body = pres.sort((a, b) => b.length - a.length)[0];
  const text = decodeEntities(
    body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
  ).replace(/\t/g, '    ');

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
  const og = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
  const title = decodeEntities((h1 || og || 'Sin título').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const artist = decodeEntities(og).split(/\s[-–]\s/).at(-2)?.trim();

  const lines = classify(text);
  if (!lines.some((l) => l.t === 'lyric')) throw new Error('Esa página no tiene letra');
  return { title, artist, lines };
}

// ---------- Red ----------

function checkUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida');
  }
  if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname)) throw new Error('Fuente no permitida');
  return u;
}

async function get(url, accept) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9', Accept: accept },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Cifra Club respondió ${res.status}`);
  return res;
}

export async function fetchSong(rawUrl) {
  const u = checkUrl(rawUrl);
  const html = await (await get(u.href, 'text/html')).text();
  return { ...parseSongHtml(html), url: u.href, source: 'Cifra Club' };
}

export function parseSearchJson(data) {
  return (data?.results || [])
    .filter((r) => r.type === 'song' && r.slug && r.artist?.slug)
    .slice(0, 12)
    .map((r) => ({
      title: r.name,
      artist: r.artist.name,
      url: `https://www.cifraclub.com/${r.artist.slug}/${r.slug}/`,
      source: 'Cifra Club',
    }));
}

export async function searchSongs(q) {
  const res = await get(`${SEARCH}?q=${encodeURIComponent(q)}&lang=es`, 'application/json');
  return parseSearchJson(await res.json());
}
