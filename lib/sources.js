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
// Encabezado de sección: [entre corchetes] o una palabra clave sola (con número / "x2" opcionales).
// Estricto a propósito: "Solo quiero cantar" o "Final de la historia" son letra, no secciones.
const SECTION_WORDS =
  'intro|introducci[oó]n|estribillo|coro|verso|puente|solo|outro|final|interludio|instrumental|' +
  'pre[- ]?coro|(?:primera|segunda|tercera|cuarta|quinta|sexta)\\s+parte';
const SECTION = new RegExp(
  `^\\s*(?:\\[[^\\]]+\\]|(?:${SECTION_WORDS})(?:\\s+\\d+)?\\s*:?\\s*(?:\\(\\s*(?:x\\s*\\d+|\\d+\\s*x)\\s*\\))?)\\s*$`,
  'i'
);

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
    else if (SECTION.test(t)) out.push({ t: 'section', text: t.trim() });
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
  const finalHost = new URL(res.url || url).hostname;
  if (!HOSTS.includes(finalHost) && finalHost !== 'solr.sscdn.co') throw new Error('Redirección no permitida');
  return res;
}

export async function fetchSong(rawUrl) {
  const u = checkUrl(rawUrl);
  const html = await (await get(u.href, 'text/html')).text();
  return { ...parseSongHtml(html), url: u.href, source: 'Cifra Club' };
}

export function parseSearchJson(data) {
  const out = [];
  for (const r of data?.results || []) {
    if (r.type === 'artist' && r.slug) {
      out.push({
        kind: 'artist',
        title: r.name,
        artist: r.song_count ? `Artista · ${r.song_count} canciones` : 'Artista',
        slug: r.slug,
      });
    } else if (r.type === 'song' && r.slug && r.artist?.slug) {
      out.push({
        kind: 'song',
        title: r.name,
        artist: r.artist.name,
        url: `https://www.cifraclub.com/${r.artist.slug}/${r.slug}/`,
        source: 'Cifra Club',
      });
    }
    if (out.length >= 20) break;
  }
  return out;
}

// Combina dos buscadores de Cifra Club: el rápido ("suggest", títulos exactos y artistas)
// y el completo ("search", más tolerante: también encuentra por fragmentos de la letra).
// Los exactos van primero; los demás se suman sin repetir.
export async function searchSongs(q) {
  const enc = encodeURIComponent(q);
  const jobs = ['suggest', 'search'].map((kind) =>
    get(`https://solr.sscdn.co/cifraclub-explore/v1/${kind === 'suggest' ? 'search/suggest' : 'search'}?q=${enc}&lang=es`, 'application/json')
      .then((r) => r.json())
      .then(parseSearchJson)
  );
  const done = await Promise.allSettled(jobs);
  if (done.every((d) => d.status === 'rejected')) throw done[0].reason;
  const seen = new Set();
  const out = [];
  for (const d of done) {
    if (d.status !== 'fulfilled') continue;
    for (const it of d.value) {
      const key = it.url || `artist:${it.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }
  return out.slice(0, 25);
}

// Canciones más populares de un artista (la página las lista ordenadas por fama).
// No depende de clases CSS (son ofuscadas): toma cada <a> a /artista/cancion/ que tenga botón,
// y lee sus textos en orden: [posición, título, visitas, tono, "Opciones"].
export function parseArtistHtml(html, slug, artistName) {
  const re = new RegExp(`<a\\b[^>]*href="/${slug}/([a-z0-9-]+)/"[^>]*>([\\s\\S]*?)</a>`, 'gi');
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(re)) {
    if (!/<button/i.test(m[2]) || seen.has(m[1])) continue;
    const parts = decodeEntities(m[2].replace(/<[^>]+>/g, '|'))
      .split('|')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!/^\d+$/.test(parts[0] || '') || !parts[1]) continue;
    seen.add(m[1]);
    out.push({
      kind: 'song',
      title: parts[1],
      artist: artistName,
      url: `https://www.cifraclub.com/${slug}/${m[1]}/`,
      source: 'Cifra Club',
    });
  }
  return out;
}

export async function fetchArtist(slug, name = '') {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new Error('Artista inválido');
  const html = await (await get(`https://www.cifraclub.com/${slug}/`, 'text/html')).text();
  const songs = parseArtistHtml(html, slug, name);
  if (!songs.length) throw new Error('No encontré canciones de ese artista');
  return songs;
}
