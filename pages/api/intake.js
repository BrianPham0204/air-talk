import { redis } from '../../lib/redis';
import { buildFingerprint } from '../../lib/sheets';
import { google } from 'googleapis';

export const config = { maxDuration: 30 };

function extractDocId(url) {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function fetchDocText(fileId) {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' }
  );
  return String(res.data);
}

async function getFingerprint() {
  const CACHE_KEY = 'policy_fingerprint';
  const cached = await redis.get(CACHE_KEY);
  if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
  const fp = await buildFingerprint();
  await redis.set(CACHE_KEY, JSON.stringify(fp), { ex: 86400 });
  return fp;
}

// This endpoint only fetches doc + fingerprint — AI call happens in the browser
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, docUrl } = req.body || {};

  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const session = await redis.get(`sess_${token}`);
  if (!session) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  if (!docUrl) return res.status(400).json({ error: 'Thiếu docUrl' });
  const docId = extractDocId(docUrl);
  if (!docId) return res.status(400).json({ error: 'URL Google Doc không hợp lệ' });

  let docText;
  try {
    docText = await fetchDocText(docId);
  } catch (e) {
    return res.status(400).json({ error: 'Không đọc được file: ' + e.message });
  }

  let fp;
  try {
    fp = await getFingerprint();
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi lấy fingerprint: ' + e.message });
  }

  return res.json({
    ok: true,
    docText: docText.slice(0, 40000),
    truncated: docText.length > 40000,
    codes: fp.codes,
    fpCount: fp.count,
    today: new Date().toISOString().slice(0, 10),
    orKey: process.env.OPENROUTER_API_KEY,
  });
}
