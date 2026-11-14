import assert from 'node:assert/strict';
import { parseSongHtml, parseSearchHtml, isChordLine } from './lib/sources.js';

// Chords
for (const l of ['Am  G  F  E', 'C#m7 F#sus4/A#', 'D/F#   Em7', '| Am | G |', 'Am x2'])
  assert.ok(isChordLine(l), l);
for (const l of ['Siempre que te miro', 'A veces me pregunto', 'Dime que sí', ''])
  assert.ok(!isChordLine(l), l);

// Página tipo Cifra Club / La Cuerda
const html = `<html><head><title>Zamba de mi esperanza - Cifra Club</title></head><body>
<h1>Zamba de mi esperanza</h1>
<pre><b>Am</b>        <b>E7</b>
Vengo de muy lejos &amp; no me voy<br>

[Estribillo]
<b>Dm</b>   <b>G</b>   <b>C</b>
Zamba de mi esperanza</pre></body></html>`;
const s = parseSongHtml(html);
assert.equal(s.title, 'Zamba de mi esperanza');
assert.deepEqual(s.lines.map((l) => l.t), ['chord', 'lyric', 'blank', 'section', 'chord', 'lyric']);
assert.ok(s.lines[1].text.includes('& no me voy'));

// Resultados de búsqueda
const ddg = `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://www.cifraclub.com/mercedes-sosa/gracias-a-la-vida/')}&rut=x">Gracias a la Vida - Mercedes Sosa - Cifra Club</a>
<a class="result__a" href="https://evil.com/x">Nope</a>
<a class="result__a" href="https://www.cifraclub.com/mercedes-sosa/">Artista</a>`;
const r = parseSearchHtml(ddg);
assert.equal(r.length, 1);
assert.equal(r[0].title, 'Gracias a la Vida - Mercedes Sosa');
console.log('OK');
