// Arranca server.js con Cifra Club simulado (sin red): sirve para tests de API y de interfaz.
const realFetch = globalThis.fetch;
const Z = '​';

function songHtml() {
  const verse = (n) =>
    `${Z}[Verso ${n}]\n\n` +
    Array.from({ length: 6 }, (_, i) => `${Z}   <b>Am</b>      <b>G7(9)</b>     <b>C7M</b>\n${Z}Línea de prueba número ${n}-${i + 1} para cantar fuerte\n`).join('') +
    `\n${Z}( <b>Am</b>  <b>Am/G</b> )\n\n`;
  const tab = 'E|-0-0-1-----1-------4-----| \nB|-----------0-----0-------| \n';
  const long = `${Z}<b>Em</b>  <b>D</b>\n${Z}Una línea larga de verdad para probar el ajuste de letra\n`;
  return `<html><head><title>Tema Uno (acordes) - Banda Demo - Cifra Club</title></head><body>
<h1>Tema Uno</h1><pre><div>${Z}[Intro]\n\n<div class="tabs"><span class="tab">   <b>D°</b>   <b>F°</b>\n${tab}</span></div></div><div>${verse(1)}${long}\n${verse(2)}${verse(3)}${Z}Solo quiero cantar hasta el final\n</div></pre></body></html>`;
}

function extremeHtml() {
  const long = 'Esta línea es exageradamente larga y no entra en ningún celular por más que se achique la letra todo lo posible jamás';
  return `<html><head><title>Extremo (acordes) - Banda Demo - Cifra Club</title></head><body><h1>Extremo</h1><pre>${Z}<b>Am</b>  <b>G</b>\n${Z}${long}\n${Z}Otra línea corta\n</pre></body></html>`;
}

const artistHtml = `<html><body>
<a href="/banda-demo/"><div>Banda Demo</div></a>
<a href="/banda-demo/tema-uno/"><div><p>01</p><div><p>Tema Uno</p></div></div><span>3821</span><span>Bm</span><button><span>Opciones</span></button></a>
<a href="/banda-demo/tema-dos/"><div><p>02</p><div><p>Tema Dos</p></div></div><span>1704</span><span>D</span><button><span>Opciones</span></button></a>
<a href="/banda-demo/extremo/"><div><p>03</p><div><p>Extremo</p></div></div><span>10</span><span>Am</span><button><span>Opciones</span></button></a>
</body></html>`;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const html = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html' } });

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'solr.sscdn.co') {
    const q = url.searchParams.get('q');
    if (q === 'falla') return json({}, 500);
    if (q === 'vacio') return json({ results: [] });
    const isSuggest = url.pathname.endsWith('/suggest');
    const song = { type: 'song', name: 'Tema Uno', slug: 'tema-uno', artist: { name: 'Banda Demo', slug: 'banda-demo' } };
    return json({
      results: isSuggest
        ? [{ type: 'artist', name: 'Banda Demo', slug: 'banda-demo', song_count: 120 }, song]
        : [song, { type: 'song', name: 'Otro Tema', slug: 'otro-tema', artist: { name: 'Otra Banda', slug: 'otra-banda' } }, { type: 'album', name: 'Disco', slug: 'disco' }],
    });
  }
  if (url.hostname === 'r.jina.ai') {            // el lector devuelve el mismo HTML desde su red
    if (globalThis.__JINA_DOWN) return html('error', 500);
    return globalThis.fetchPage(new URL(url.pathname.slice(1) + url.search), true);
  }
  if (url.hostname === 'www.cifraclub.com') return globalThis.fetchPage(url, false);
  return realFetch(input, init); // el navegador/tests hablan con el servidor local de verdad
};

globalThis.fetchPage = async (url, viaProxy) => {
  {
    if (globalThis.__BLOCK && !viaProxy) return html('<HTML><TITLE>Access Denied</TITLE></HTML>', 403);
    if (url.pathname === '/banda-demo/') return html(artistHtml);
    if (url.pathname === '/banda-demo/tema-uno/') return html(songHtml());
    if (url.pathname === '/banda-demo/extremo/') return html(extremeHtml());
    if (url.pathname === '/banda-demo/sin-pre/') return html('<html><body>nada</body></html>');
    return html('404', 404);
  }
};

await import('../server.js');
