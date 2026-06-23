import { redis } from '../../../lib/redis';
import { buildFingerprint } from '../../../lib/sheets';

const CACHE_KEY = 'policy_fingerprint';
const CACHE_TTL = 86400; // 24h

async function requireAuth(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const session = await redis.get(`sess_${token}`);
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export default async function handler(req, res) {
  const token = req.query.token || req.body?.token;

  try {
    await requireAuth(token);
  } catch {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  // GET — return cached fingerprint (rebuild if missing)
  if (req.method === 'GET') {
    let fp = await redis.get(CACHE_KEY);
    if (!fp) {
      fp = await buildFingerprint();
      await redis.set(CACHE_KEY, fp, { ex: CACHE_TTL });
    }
    return res.json(fp);
  }

  // POST — force rebuild
  if (req.method === 'POST') {
    const fp = await buildFingerprint();
    await redis.set(CACHE_KEY, fp, { ex: CACHE_TTL });
    return res.json({ ok: true, count: fp.count, generated: fp.generated });
  }

  return res.status(405).end();
}
