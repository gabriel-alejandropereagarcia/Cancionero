import assert from 'node:assert/strict';
import { parseSongHtml, parseSearchJson, isChordLine, isTabLine } from './lib/sources.js';

// Acordes reales de Cifra Club (formas raras incluidas)
for (const l of ['Am  G  F  E', 'C#m7 F#sus4/A#', 'D°  F°  G#°', 'Am9/G   Am', 'G7(9)  C7M  F7M', 'Dm7(9)  E7  Am  Am/G', '( Am  Am/G  Am/F )', '| Am | G |', 'Am x2', '​    Dm7  E7'.replace('​', '')])
  assert.ok(isChordLine(l), l);
for (const l of ['Siempre que te miro', 'A veces me pregunto', 'Dime que sí', 'Es ahí donde vivo', ''])
  assert.ok(!isChordLine(l), l);
assert.ok(isTabLine('E|-0-0-0-1-----1-------4---------| '));
assert.ok(isTabLine('G|-------------1-----1-----|'));
assert.ok(!isTabLine('Ese hombre | que canta'));

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

// Respuesta del buscador de Cifra Club
const r = parseSearchJson({
  results: [
    { type: 'song', name: 'Gracias a La Vida', slug: 'gracias-la-vida', artist: { name: 'Mercedes Sosa', slug: 'mercedes-sosa' } },
    { type: 'artist', name: 'Mercedes Sosa', slug: 'mercedes-sosa' },
    { type: 'song', name: 'Sin artista', slug: 'x' },
  ],
});
assert.deepEqual(r, [{ title: 'Gracias a La Vida', artist: 'Mercedes Sosa', url: 'https://www.cifraclub.com/mercedes-sosa/gracias-la-vida/', source: 'Cifra Club' }]);
console.log('OK');
