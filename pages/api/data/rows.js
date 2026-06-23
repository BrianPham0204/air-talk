import { redis } from '../../../lib/redis';
import { getRowsByCodes } from '../../../lib/sheets';

async function requireAuth(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const session = await redis.get(`sess_${token}`);
  if (!session) throw new Error('AUTH_REQUIRED');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { token, codes } = req.query;

  try {
    await requireAuth(token);
  } catch {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  if (!codes) return res.status(400).json({ error: 'Missing codes param' });

  const codeList = String(codes).split(',').map(c => c.trim()).filter(Boolean);
  if (!codeList.length) return res.status(400).json({ error: 'Empty codes list' });

  try {
    const result = await getRowsByCodes(codeList);
    return res.json(result);
  } catch (e) {
    console.error('[rows]', e);
    return res.status(500).json({ error: e.message });
  }
}
