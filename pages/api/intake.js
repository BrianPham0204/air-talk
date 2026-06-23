import { redis } from '../../lib/redis';
import { buildFingerprint } from '../../lib/sheets';
import { google } from 'googleapis';

export const config = { maxDuration: 60 };

const COLS = [
  'code','category','keyword','tags','summary_main','when_to_use','check','script_en',
  'source_file','source_link','status','last_updated','hot','tree_code','node_id','node_type','options','flagged'
];

const TODAY = () => new Date().toISOString().slice(0, 10);

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

async function callGemini(docText, existingCodes) {
  const today = TODAY();
  const codeList = Object.keys(existingCodes).join(', ');

  const prompt = `Bạn là trợ lý xử lý policy cho AirTalk CS.

## Existing policy codes (${Object.keys(existingCodes).length} codes):
${codeList}

## Tài liệu mới:
${docText.slice(0, 80000)}

## Nhiệm vụ:
Đọc tài liệu, trích xuất từng tình huống/chính sách, cấu trúc thành records 18 cột:
code | category | keyword | tags | summary_main | when_to_use | check | script_en | source_file | source_link | status | last_updated | hot | tree_code | node_id | node_type | options | flagged

Quy tắc:
- code: chữ thường, dùng dấu gạch ngang (vd: esim-transfer). Flow node: {tree-code}_{nodeId}
- status: luôn "needs-review", last_updated: ${today}
- source_file: tên file/tài liệu nguồn nếu biết
- hot, tree_code, node_id, node_type, options, flagged: để trống nếu không rõ
- "add": code CHƯA CÓ trong existing codes → thêm mới
- "replace": code ĐÃ CÓ trong existing codes → thay thế
- "need-check": mâu thuẫn hoặc không chắc

Trả về CHỈ JSON array, không markdown, không text thêm:
[{"action":"add","note":"lý do","record":{"code":"...","category":"...","keyword":"...","tags":"...","summary_main":"...","when_to_use":"...","check":"...","script_en":"...","source_file":"...","source_link":"","status":"needs-review","last_updated":"${today}","hot":"","tree_code":"","node_id":"","node_type":"","options":"","flagged":""}}]`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('AI không trả về JSON hợp lệ');
  return JSON.parse(m[0]);
}

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

  let records;
  try {
    records = await callGemini(docText, fp.codes);
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi AI: ' + e.message });
  }

  records = records.map(r => {
    const rec = r.record || {};
    COLS.forEach(c => { if (rec[c] == null) rec[c] = ''; });
    return { action: r.action || 'need-check', note: r.note || '', record: rec };
  });

  return res.json({ ok: true, records, count: records.length, fpCount: fp.count });
}
