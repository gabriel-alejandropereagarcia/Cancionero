import { fetchSong } from '../lib/sources.js';

export default async function handler(req, res) {
  try {
    const song = await fetchSong(String(req.query.url || ''));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(song);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
