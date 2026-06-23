import { redis } from '../../../lib/redis';
import { bulkWrite } from '../../../lib/sheets';

const CACHE_KEY = 'policy_fingerprint';

async function requireAuth(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const session = await redis.get(`sess_${token}`);
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, records } = req.body;

  try {
    await requireAuth(token);
  } catch {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }

  // Validate each record has action + code
  for (const r of records) {
    if (!['add', 'replace'].includes(r.action)) {
      return res.status(400).json({ error: `Invalid action: ${r.action}` });
    }
    if (!r.record?.code) {
      return res.status(400).json({ error: 'Each record must have a code field' });
    }
  }

  try {
    const result = await bulkWrite(records);

    // Invalidate fingerprint cache so next GET rebuilds fresh
    await redis.del(CACHE_KEY);

    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[bulk]', e);
    return res.status(500).json({ error: e.message });
  }
}
