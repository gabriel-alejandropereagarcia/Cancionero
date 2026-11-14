const $ = (id) => document.getElementById(id);
const RECENTS_KEY = 'cancionero.recents';
const SPEED_KEY = 'cancionero.speed';

// ---------- Búsqueda ----------
$('search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  $('results').innerHTML = '';
  setStatus('Buscando…');
  try {
    const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
    setStatus(r.results.length ? '' : 'Sin resultados. Probá con artista + título.');
    renderList($('results'), r.results);
  } catch (err) {
    setStatus(err.message);
  }
});

function setStatus(t) { $('status').textContent = t; }

async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}

function renderList(ul, items) {
  ul.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = it.title;
    const s = document.createElement('small');
    s.textContent = it.artist || it.source || '';
    b.append(s);
    b.onclick = () => openSong(it.url);
    li.append(b);
    ul.append(li);
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
  try {
    song = await api(`/api/song?url=${encodeURIComponent(url)}`);
    saveRecent(song);
  } catch (err) {
    if (!song) return setStatus(err.message);   // sin red y sin copia local
  }
  setStatus('');
  showPlayer(song);
}

// ---------- Teleprompter ----------
let playing = false, speed = Number(localStorage.getItem(SPEED_KEY)) || 40; // px/seg
let last = 0, acc = 0, wakeLock = null;

function showPlayer(song) {
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
  window.scrollTo(0, 0);
  updateSpeed();
}

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

async function play() {
  playing = true;
  $('play').textContent = '⏸';
  last = performance.now();
  acc = 0;
  requestAnimationFrame(tick);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function pause() {
  playing = false;
  $('play').textContent = '▶';
  wakeLock?.release?.().catch?.(() => {});
  wakeLock = null;
}
function tick(now) {
  if (!playing) return;
  acc += speed * ((now - last) / 1000);
  last = now;
  const step = Math.floor(acc);
  if (step >= 1) { window.scrollBy(0, step); acc -= step; }
  const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atEnd) return pause();
  requestAnimationFrame(tick);
}

$('play').onclick = () => (playing ? pause() : play());
$('song').onclick = () => (playing ? pause() : play());   // tocar la letra también pausa/sigue
$('slower').onclick = () => setSpeed(speed - 5);
$('faster').onclick = () => setSpeed(speed + 5);
$('back').onclick = closePlayer;
// Si el usuario arrastra con el dedo, no pelear con el scroll automático
window.addEventListener('touchstart', () => { acc = 0; last = performance.now(); }, { passive: true });
document.addEventListener('visibilitychange', async () => {
  if (playing && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  }
});

showRecents();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
