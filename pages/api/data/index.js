import { redis } from '../../../lib/redis';
import { getSheetData, setSheetFlag } from '../../../lib/sheets';

async function requireAuth(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const session = await redis.get(`sess_${token}`);
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { token } = req.query;
      await requireAuth(token);
      const data = await getSheetData();
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { token, code, flagged } = req.body;
      await requireAuth(token);
      const result = await setSheetFlag(code, flagged);
      return res.json(result);
    }

    return res.status(405).end();
  } catch (e) {
    if (e.message === 'AUTH_REQUIRED') return res.status(401).json({ error: 'AUTH_REQUIRED' });
    console.error('[data]', e);
    return res.status(500).json({ error: e.message });
  }
}
