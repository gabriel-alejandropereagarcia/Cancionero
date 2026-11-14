import assert from 'node:assert/strict';
import { parseSongHtml, parseSearchJson, parseArtistHtml, isChordLine, isTabLine, classify } from './lib/sources.js';

// Acordes reales de Cifra Club (formas raras incluidas)
for (const l of ['Am  G  F  E', 'C#m7 F#sus4/A#', 'D°  F°  G#°', 'Am9/G   Am', 'G7(9)  C7M  F7M', 'Dm7(9)  E7  Am  Am/G', '( Am  Am/G  Am/F )', '| Am | G |', 'Am x2', '​    Dm7  E7'.replace('​', '')])
  assert.ok(isChordLine(l), l);
for (const l of ['Siempre que te miro', 'A veces me pregunto', 'Dime que sí', 'Es ahí donde vivo', ''])
  assert.ok(!isChordLine(l), l);
assert.ok(isTabLine('E|-0-0-0-1-----1-------4---------| '));
assert.ok(isTabLine('G|-------------1-----1-----|'));
assert.ok(!isTabLine('Ese hombre | que canta'));

// Secciones: solo encabezados reales; la letra que empieza con esas palabras sigue siendo letra
const kind = (l) => classify(l)[0].t;
for (const l of ['Intro', 'Estribillo:', 'Coro 2', '[Solo]', 'Puente (x2)', '[Primera Parte]', 'Instrumental']) assert.equal(kind(l), 'section', l);
for (const l of ['Solo quiero cantar', 'Final de la historia', 'Coro de ángeles', 'Verso a verso', 'Solo vi', 'Es la vida']) assert.equal(kind(l), 'lyric', l);

// Estructura imitando la página real: <pre> con divs/spans/<b>, ZWSP, tablaturas y secciones
const Z = '​';
const html = `<html><head><title>Canción de prueba (acordes) - Artista Demo - Cifra Club</title></head><body>
<h1>Canción de prueba</h1>
<pre class="x"><div class="a">${Z}[Intro]\n\n</div><div class="a"><div class="tabs"><span class="tab">   <b data-chord-name="D°">D°</b>   <b>F°</b>
E|-0-0-0-1-----1-----| 
B|-----------0-------| 
</span></div></div>
<div>${Z}[Primera Parte]\n\n\n${Z}   <b>Dm7</b>  <b>E7</b>   <b>Am7</b>\n${Z}Letra de prueba uno &amp; dos\n${Z}  <b>G7(9)</b>   <b>C7M</b>\n${Z}Otra línea inventada\n\n${Z}( <b>Am</b>  <b>Am/G</b> )\n</div></pre></body></html>`;
const s = parseSongHtml(html);
assert.equal(s.title, 'Canción de prueba');
assert.equal(s.artist, 'Artista Demo');
const kinds = s.lines.map((l) => l.t).join(',');
assert.equal(kinds, 'section,blank,chord,blank,section,blank,chord,lyric,chord,lyric,blank,chord');
assert.ok(!s.lines.some((l) => /\|/.test(l.text) && l.t !== 'chord'), 'sin tablaturas');
assert.ok(s.lines.every((l) => !l.text.includes(Z)));
assert.ok(s.lines.find((l) => l.t === 'lyric').text.includes('& dos'));

// Respuesta del buscador de Cifra Club: artistas y canciones; descarta álbumes
const r = parseSearchJson({
  results: [
    { type: 'artist', name: 'Banda Demo', slug: 'banda-demo', song_count: 120 },
    { type: 'album', name: 'Disco', slug: 'disco' },
    { type: 'song', name: 'Tema Uno', slug: 'tema-uno', artist: { name: 'Banda Demo', slug: 'banda-demo' } },
    { type: 'song', name: 'Sin artista', slug: 'x' },
  ],
});
assert.deepEqual(r, [
  { kind: 'artist', title: 'Banda Demo', artist: 'Artista · 120 canciones', slug: 'banda-demo' },
  { kind: 'song', title: 'Tema Uno', artist: 'Banda Demo', url: 'https://www.cifraclub.com/banda-demo/tema-uno/', source: 'Cifra Club' },
]);

// Página de artista: <a> con [posición, título, visitas, tono, Opciones] y botón; clases ofuscadas
const artistHtml = `
<a href="/banda-demo/"><div>menu</div></a>
<a href="/banda-demo/tema-uno/" class="zZ"><div class="a"><p class="x">01</p><div><p class="y">Tema Uno</p></div></div><span>3821</span><span>Bm</span><button><span>Opciones</span></button></a>
<a href="/banda-demo/tema-dos-123/" class="zZ"><div><p>02</p><div><p>Tema &amp; Dos</p></div></div><span>1704</span><span>D</span><button><span>Opciones</span></button></a>
<a href="/banda-demo/tema-uno/"><p>01</p><p>Tema Uno</p><button>x</button></a>
<a href="/banda-demo/fotos/">Fotos</a>`;
const al = parseArtistHtml(artistHtml, 'banda-demo', 'Banda Demo');
assert.deepEqual(al.map((x) => x.title), ['Tema Uno', 'Tema & Dos']);
assert.equal(al[1].url, 'https://www.cifraclub.com/banda-demo/tema-dos-123/');
console.log('OK');
