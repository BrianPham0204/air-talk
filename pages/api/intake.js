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

const CHUNK_CHARS = 7000; // ~2300 tokens content per chunk
const CHUNK_MODEL = 'llama-3.1-8b-instant'; // 20k TPM free tier

function chunkText(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function callGroqChunk(chunk, chunkIdx, totalChunks, codeList, existingCodesCount) {
  const today = TODAY();
  const prompt = `Bạn là trợ lý xử lý policy cho AirTalk CS.
Đây là phần ${chunkIdx + 1}/${totalChunks} của tài liệu.

## Existing policy codes (${existingCodesCount} codes):
${codeList}

## Nội dung tài liệu (phần ${chunkIdx + 1}/${totalChunks}):
${chunk}

## Nhiệm vụ:
Trích xuất các tình huống/chính sách từ phần này → cấu trúc thành records 18 cột:
code | category | keyword | tags | summary_main | when_to_use | check | script_en | source_file | source_link | status | last_updated | hot | tree_code | node_id | node_type | options | flagged

Quy tắc:
- code: chữ thường, dùng dấu gạch ngang (vd: esim-transfer)
- status: luôn "needs-review", last_updated: ${today}
- Phân loại: "add" (code mới), "replace" (code đã có), "need-check" (không chắc)
- Nếu phần này không chứa policy nào rõ ràng, trả về []

Trả về CHỈ JSON array, không markdown:
[{"action":"add","note":"lý do","record":{"code":"...","category":"...","keyword":"...","tags":"...","summary_main":"...","when_to_use":"...","check":"...","script_en":"...","source_file":"...","source_link":"","status":"needs-review","last_updated":"${today}","hot":"","tree_code":"","node_id":"","node_type":"","options":"","flagged":""}}]`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHUNK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (res.status === 429) {
      const errText = await res.text();
      const retryMatch = errText.match(/try again in ([\d.]+)s/);
      const wait = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) * 1000 + 1000 : 15000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try { return JSON.parse(m[0]); } catch { return []; }
  }
  return [];
}

async function callGroq(docText, existingCodes) {
  const codeList = Object.keys(existingCodes).join(', ');
  const chunks = chunkText(docText, CHUNK_CHARS);

  const allRecords = [];
  const seenCodes = new Set();

  for (let i = 0; i < chunks.length; i++) {
    const records = await callGroqChunk(chunks[i], i, chunks.length, codeList, Object.keys(existingCodes).length);
    for (const r of records) {
      const code = r.record?.code;
      if (code && seenCodes.has(code)) continue; // deduplicate
      if (code) seenCodes.add(code);
      allRecords.push(r);
    }
    // Wait between chunks to stay within 20k TPM of llama-3.1-8b-instant
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 5000));
  }

  return allRecords;
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
    records = await callGroq(docText, fp.codes);
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
