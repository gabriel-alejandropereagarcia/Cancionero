import { searchSongs } from '../lib/sources.js';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q.length < 2) return res.status(400).json({ error: 'Escribí al menos 2 letras' });
  try {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ results: await searchSongs(q) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
