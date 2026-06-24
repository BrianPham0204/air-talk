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

async function callAI(docText, existingCodes) {
  const today = TODAY();
  const codeList = Object.keys(existingCodes).join(', ');
  const docSlice = docText.slice(0, 40000);

  const prompt = `Bạn là trợ lý xử lý policy cho AirTalk CS.

## Existing policy codes (${Object.keys(existingCodes).length} codes):
${codeList}

## Tài liệu mới:
${docSlice}${docText.length > 60000 ? `\n[...đã cắt bớt, còn ${docText.length - 60000} ký tự]` : ''}

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

  const MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-4-31b-it:free',
    'openai/gpt-oss-120b:free',
  ];

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://air-talk-ten.vercel.app',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 8192,
        }),
      });

      if (res.status === 429) {
        const errJson = await res.json().catch(() => ({}));
        const retryAfter = errJson?.error?.metadata?.retry_after_seconds;
        const wait = retryAfter ? Math.ceil(retryAfter) * 1000 + 500 : 5000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        // Try next model
        break;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const m = text.match(/\[[\s\S]*\]/);
      if (!m) throw new Error('AI không trả về JSON hợp lệ. Raw: ' + text.slice(0, 200));
      return JSON.parse(m[0]);
    }
  }

  throw new Error('Tất cả AI models đều tạm thời không khả dụng. Thử lại sau 1 phút.');
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
    records = await callAI(docText, fp.codes);
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
