import { fetchArtist } from '../lib/sources.js';

export default async function handler(req, res) {
  try {
    const results = await fetchArtist(String(req.query.slug || ''), String(req.query.name || '').slice(0, 80));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ results });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
