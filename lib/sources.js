// Búsqueda y extracción de canciones con acordes.
// Fuentes soportadas: Cifra Club y La Cuerda. El parser es genérico (busca el <pre>
// de la página y clasifica cada línea), así que agregar otra fuente es solo
// sumar su dominio a ALLOWED_HOSTS.

const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export const ALLOWED_HOSTS = [
  'cifraclub.com',
  'www.cifraclub.com',
  'm.cifraclub.com',
  'lacuerda.net',
  'acordes.lacuerda.net',
  'www.lacuerda.net',
];

const SOURCE_OF = (host) => (host.includes('cifraclub') ? 'Cifra Club' : 'La Cuerda');

// ---------- Clasificación de líneas ----------

const CHORD =
  /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M)?\d{0,2}(?:(?:sus|add|maj)?[#b]?\d{1,2})*(?:\/[A-G][#b]?)?$/;
const FILLER = /^(?:[|\-–—:.()\[\]/*]+|x\d+|\d+x|N\.?C\.?|%|\d+)$/i;
const SECTION =
  /^\s*(?:\[[^\]]+\]|(?:intro|introducci[oó]n|estribillo|coro|verso|puente|solo|outro|final|pre[- ]?coro|interludio|strophe|chorus|verse|bridge)\b[^a-záéíóúñ]{0,20}.{0,15}:?)\s*$/i;

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

export function classify(text) {
  return text.split('\n').map((raw) => {
    const t = raw.replace(/\s+$/, '');
    if (!t.trim()) return { t: 'blank', text: '' };
    if (isChordLine(t)) return { t: 'chord', text: t };
    if (SECTION.test(t) && t.trim().length < 40) return { t: 'section', text: t.trim() };
    return { t: 'lyric', text: t };
  });
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
  )
    .replace(/\t/g, '    ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = decodeEntities((h1 || html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Sin título').replace(/<[^>]+>/g, ''))
    .replace(/\s*[-–|]\s*(Cifra Club|La Cuerda).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, lines: classify(text) };
}

// ---------- Red ----------

function checkUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida');
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) {
    throw new Error('Fuente no permitida');
  }
  return u;
}

async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9' } });
  if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
  const buf = await res.arrayBuffer();
  let html = new TextDecoder('utf-8').decode(buf);
  if (html.includes('�')) html = new TextDecoder('windows-1252').decode(buf);
  return html;
}

export async function fetchSong(rawUrl) {
  const u = checkUrl(rawUrl);
  const song = parseSongHtml(await getHtml(u.href));
  return { ...song, url: u.href, source: SOURCE_OF(u.hostname) };
}

export function parseSearchHtml(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = decodeEntities(m[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    let u;
    try {
      u = checkUrl(href);
    } catch {
      continue;
    }
    // Descarta portadas de artista / listados: queremos páginas de canción.
    const segs = u.pathname.split('/').filter(Boolean);
    if (u.hostname.includes('cifraclub') && segs.length < 2) continue;
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, ''))
      .replace(/\s*[-–|]\s*(Cifra Club|La Cuerda).*$/i, '')
      .trim();
    out.push({ title, url: u.href, source: SOURCE_OF(u.hostname) });
  }
  return out.slice(0, 10);
}

export async function searchSongs(q) {
  const query = `${q} acordes (site:cifraclub.com OR site:lacuerda.net)`;
  const html = await getHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  return parseSearchHtml(html);
}
