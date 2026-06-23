import { redis } from '../../lib/redis';

const CHAT_TTL = 21600;  // 6h
const CHAT_MAX = 60;
const PRES_TTL = 21600;

function sanRoom(r) {
  return String(r || 'cs-floor').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'cs-floor';
}

async function requireAuth(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const session = await redis.get(`sess_${token}`);
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export default async function handler(req, res) {
  try {
    // GET = chatPoll
    if (req.method === 'GET') {
      const { token, room: rawRoom } = req.query;
      const sess = await requireAuth(token);
      const room = sanRoom(rawRoom);
      const now = Date.now();

      // Update presence
      const presKey = `cp_${room}`;
      const pres = (await redis.get(presKey)) || {};
      pres[sess.name] = now;
      Object.keys(pres).forEach(n => { if (now - pres[n] > 30000) delete pres[n]; });
      await redis.set(presKey, pres, { ex: PRES_TTL });

      const msgs = (await redis.get(`cm_${room}`)) || [];
      const online = Object.keys(pres).filter(n => now - pres[n] < 12000).sort();

      return res.json({ messages: msgs, online, me: sess.name });
    }

    // POST = chatSend or chatLeave
    if (req.method === 'POST') {
      const { token, action, room: rawRoom, text } = req.body;
      const sess = await requireAuth(token);
      const room = sanRoom(rawRoom);

      if (action === 'send') {
        const msg = String(text || '').slice(0, 500);
        if (!msg) return res.json({ ok: false });

        const msgsKey = `cm_${room}`;
        let msgs = (await redis.get(msgsKey)) || [];
        msgs.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          user: sess.name,
          text: msg,
          ts: Date.now(),
        });
        if (msgs.length > CHAT_MAX) msgs = msgs.slice(-CHAT_MAX);
        await redis.set(msgsKey, msgs, { ex: CHAT_TTL });

        const presKey = `cp_${room}`;
        const pres = (await redis.get(presKey)) || {};
        pres[sess.name] = Date.now();
        await redis.set(presKey, pres, { ex: PRES_TTL });

        return res.json({ ok: true });
      }

      if (action === 'leave') {
        const presKey = `cp_${room}`;
        const pres = (await redis.get(presKey)) || {};
        delete pres[sess.name];
        await redis.set(presKey, pres, { ex: PRES_TTL });
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).end();
  } catch (e) {
    if (e.message === 'AUTH_REQUIRED') return res.status(401).json({ error: 'AUTH_REQUIRED' });
    console.error('[chat]', e);
    return res.status(500).json({ error: e.message });
  }
}
