import crypto from 'crypto';
import { redis } from '../../lib/redis';

const SESSION_TTL = 28800; // 8h in seconds

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, name, code, token } = req.body;

  if (action === 'login') {
    const displayName = String(name || '').trim().slice(0, 24);
    if (!displayName) return res.status(400).json({ error: 'Vui lòng nhập tên hiển thị.' });

    const want = process.env.TEAM_CODE;
    if (want && String(code || '').trim() !== want) {
      return res.status(401).json({ error: 'Sai mã truy cập.' });
    }

    const sessionToken = crypto.randomUUID();
    const session = { user: displayName.toLowerCase(), name: displayName, role: 'agent', ts: Date.now() };
    await redis.set(`sess_${sessionToken}`, session, { ex: SESSION_TTL });

    return res.json({ ok: true, token: sessionToken, name: displayName, role: 'agent' });
  }

  if (action === 'logout') {
    if (token) await redis.del(`sess_${token}`);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
