// Diagnóstico temporal: prueba distintas formas de pedir una canción desde Vercel.
const TARGET = 'https://www.cifraclub.com/los-gatos/la-balsa/';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const strategies = {
  'actual (UA simple)': () => [TARGET, { headers: { 'User-Agent': UA, Accept: 'text/html' } }],
  'headers de navegador completos': () => [
    TARGET,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Sec-Ch-Ua': '"Chromium";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        Referer: 'https://www.google.com/',
      },
    },
  ],
  'sitio móvil m.cifraclub.com': () => ['https://m.cifraclub.com/los-gatos/la-balsa/', { headers: { 'User-Agent': UA } }],
  'r.jina.ai': () => ['https://r.jina.ai/' + TARGET, { headers: { 'X-Return-Format': 'html' } }],
  allorigins: () => ['https://api.allorigins.win/raw?url=' + encodeURIComponent(TARGET), {}],
  'corsproxy.io': () => ['https://corsproxy.io/?url=' + encodeURIComponent(TARGET), {}],
};

export default async function handler(req, res) {
  const out = await Promise.all(
    Object.entries(strategies).map(async ([name, build]) => {
      const t = Date.now();
      try {
        const [url, init] = build();
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(9000) });
        const body = await r.text();
        return {
          name,
          status: r.status,
          ms: Date.now() - t,
          server: r.headers.get('server'),
          cfMitigated: r.headers.get('cf-mitigated'),
          len: body.length,
          hasPre: /<pre/i.test(body),
          head: body.replace(/\s+/g, ' ').slice(0, 110),
        };
      } catch (e) {
        return { name, error: e.message, ms: Date.now() - t };
      }
    })
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ region: process.env.VERCEL_REGION, results: out });
}
