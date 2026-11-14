const $ = (id) => document.getElementById(id);
const RECENTS_KEY = 'cancionero.recents';
const SPEED_KEY = 'cancionero.speed';
const FONT_KEY = 'cancionero.font';

// ---------- Búsqueda ----------
let searchToken = 0; // descarta respuestas viejas si el usuario busca de nuevo

$('search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (q.length < 2) return setStatus('Escribí al menos 2 letras');
  const token = ++searchToken;
  $('results').innerHTML = '';
  setStatus('Buscando…');
  try {
    const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (token !== searchToken) return;
    setStatus(r.results.length ? '' : 'Sin resultados. Probá con otro título o con el artista.');
    renderList($('results'), r.results);
  } catch (err) {
    if (token === searchToken) setStatus(err.message);
  }
});

function setStatus(t) { $('status').textContent = t; }

async function api(path) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error('Sin conexión');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function renderList(ul, items) {
  ul.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.title;
    const s = document.createElement('small');
    s.textContent = it.artist || it.source || '';
    b.append(s);
    b.onclick = () => (it.kind === 'artist' ? openArtist(it) : openSong(it.url));
    li.append(b);
    ul.append(li);
  }
}

async function openArtist(a) {
  const token = ++searchToken;
  setStatus(`Cargando canciones de ${a.title}…`);
  try {
    const r = await api(`/api/artist?slug=${encodeURIComponent(a.slug)}&name=${encodeURIComponent(a.title)}`);
    if (token !== searchToken) return;
    setStatus(`Más populares de ${a.title}`);
    renderList($('results'), r.results);
    window.scrollTo(0, 0);
  } catch (err) {
    if (token === searchToken) setStatus(err.message);
  }
}

// ---------- Recientes (para usar sin conexión) ----------
const getRecents = () => { try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; } catch { return []; } };
function saveRecent(song) {
  const list = [song, ...getRecents().filter((s) => s.url !== song.url)].slice(0, 30);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch {}
  showRecents();
}
function showRecents() {
  const list = getRecents();
  $('recentsTitle').hidden = !list.length;
  renderList($('recents'), list);
}

async function openSong(url) {
  setStatus('Cargando canción…');
  let song = getRecents().find((s) => s.url === url);
  let failure = null;
  try {
    song = await api(`/api/song?url=${encodeURIComponent(url)}`);
    saveRecent(song);
  } catch (err) {
    failure = err;
  }
  if (!song) return setStatus(failure.message);   // sin red y sin copia guardada
  setStatus('');
  history.pushState({ player: true }, '');          // el botón "atrás" del celu vuelve a la lista
  showPlayer(song);
}

// ---------- Teleprompter ----------
let playing = false;
let speed = Number(localStorage.getItem(SPEED_KEY)) || 40; // px por segundo
let last = 0, acc = 0, wakeLock = null, currentSong = null;

function showPlayer(song) {
  currentSong = song;
  $('songTitle').textContent = song.title;
  $('songSource').textContent = song.artist || song.source || '';
  const root = $('song');
  root.innerHTML = '';
  for (const l of song.lines) {
    const d = document.createElement('div');
    if (l.t !== 'lyric') d.className = l.t;
    d.textContent = l.text;
    root.append(d);
  }
  $('home').hidden = true;
  $('player').hidden = false;
  fitFont();
  window.scrollTo(0, 0);
  updateSpeed();
}

// Ajusta el tamaño de letra para que la línea más larga entre en pantalla (sin scroll horizontal).
function fitFont() {
  if (!currentSong) return;
  const root = $('song');
  const maxLen = Math.max(10, ...currentSong.lines.map((l) => l.text.length));
  root.style.fontSize = '20px';
  const probe = document.createElement('span');
  probe.textContent = '0'.repeat(40);
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  root.append(probe);
  const charW = probe.getBoundingClientRect().width / 40;
  probe.remove();
  if (!charW) return;
  const avail = root.clientWidth - 32;
  const auto = Math.max(12, Math.min(30, Math.floor((20 * avail) / (maxLen * charW))));
  root.style.fontSize = `${manualFont || auto}px`;   // si el cantor eligió un tamaño con A−/A+, ese manda
}

// A− / A+: tamaño elegido a mano (se recuerda). Mantiene el lugar de la canción donde estabas.
let manualFont = Number(localStorage.getItem(FONT_KEY)) || 0;
function changeFont(delta) {
  const root = $('song');
  const ratio = window.scrollY / Math.max(1, document.documentElement.scrollHeight);
  const cur = parseFloat(getComputedStyle(root).fontSize);
  manualFont = Math.min(40, Math.max(10, Math.round(cur + delta)));
  try { localStorage.setItem(FONT_KEY, manualFont); } catch {}
  root.style.fontSize = `${manualFont}px`;
  window.scrollTo(0, ratio * document.documentElement.scrollHeight);
}
window.addEventListener('resize', () => { if (!$('player').hidden) fitFont(); });

function closePlayer() {
  pause();
  $('player').hidden = true;
  $('home').hidden = false;
}

function updateSpeed() { $('speedLabel').textContent = `${Math.round(speed / 10)}`; }
function setSpeed(v) {
  speed = Math.min(200, Math.max(10, v));
  try { localStorage.setItem(SPEED_KEY, speed); } catch {}
  updateSpeed();
}

const atEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

async function play() {
  if (atEnd()) window.scrollTo(0, 0);               // si ya terminó, arranca de nuevo desde arriba
  playing = true;
  $('play').textContent = '⏸';
  $('play').setAttribute('aria-label', 'Pausar');
  last = performance.now();
  acc = 0;
  requestAnimationFrame(tick);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function pause() {
  playing = false;
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Reproducir');
  wakeLock?.release?.().catch?.(() => {});
  wakeLock = null;
}
function tick(now) {
  if (!playing) return;
  const dt = Math.min((now - last) / 1000, 0.1);    // un salto de tiempo (pestaña en segundo plano) no pega un salto de scroll
  last = now;
  acc += speed * dt;
  const step = Math.floor(acc);
  if (step >= 1) { window.scrollBy(0, step); acc -= step; }
  if (atEnd()) return pause();
  requestAnimationFrame(tick);
}

$('play').onclick = () => (playing ? pause() : play());
$('song').onclick = () => (playing ? pause() : play());   // tocar la letra también pausa/sigue
$('slower').onclick = () => setSpeed(speed - 5);
$('faster').onclick = () => setSpeed(speed + 5);
$('fontDown').onclick = () => changeFont(-2);
$('fontUp').onclick = () => changeFont(2);
$('back').onclick = () => history.back();
window.addEventListener('popstate', () => { if (!$('player').hidden) closePlayer(); });
// Si el usuario arrastra con el dedo, no acumular movimiento pendiente
window.addEventListener('touchstart', () => { acc = 0; last = performance.now(); }, { passive: true });
document.addEventListener('visibilitychange', async () => {
  if (playing && document.visibilityState === 'visible') {
    last = performance.now();
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  }
});

showRecents();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
