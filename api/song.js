import { fetchSong } from '../lib/sources.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(await fetchSong(String(req.query.url || '')));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
