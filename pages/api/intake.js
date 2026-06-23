import { redis } from '../../lib/redis';
import { buildFingerprint } from '../../lib/sheets';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const codeList = Object.keys(existingCodes).join(', ');

  const prompt = `Bạn là trợ lý xử lý policy cho AirTalk CS.

## Existing policy codes (${Object.keys(existingCodes).length} codes):
${codeList}

## Tài liệu mới:
${docText.slice(0, 30000)}

## Nhiệm vụ:
Đọc tài liệu, trích xuất từng tình huống/chính sách, cấu trúc thành records 18 cột:
code | category | keyword | tags | summary_main | when_to_use | check | script_en | source_file | source_link | status | last_updated | hot | tree_code | node_id | node_type | options | flagged

Quy tắc:
- code: chữ thường, dùng dấu gạch ngang (vd: esim-transfer). Flow node: {tree-code}_{nodeId}
- status: luôn "needs-review"
- last_updated: ${TODAY()}
- source_file: tên file/tài liệu nguồn nếu biết
- Các cột hot, tree_code, node_id, node_type, options, flagged: để trống nếu không rõ

Phân loại mỗi record:
- "add": code CHƯA CÓ trong existing codes → thêm mới
- "replace": code ĐÃ CÓ trong existing codes → thay thế
- "need-check": mâu thuẫn, thiếu thông tin, không chắc

Trả về CHỈ một JSON array, không có text khác:
[
  {
    "action": "add",
    "note": "lý do ngắn",
    "record": {
      "code": "...",
      "category": "...",
      "keyword": "...",
      "tags": "...",
      "summary_main": "...",
      "when_to_use": "...",
      "check": "...",
      "script_en": "...",
      "source_file": "...",
      "source_link": "",
      "status": "needs-review",
      "last_updated": "${TODAY()}",
      "hot": "",
      "tree_code": "",
      "node_id": "",
      "node_type": "",
      "options": "",
      "flagged": ""
    }
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

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
    const msg = e.message || '';
    return res.status(400).json({ error: 'Không đọc được file: ' + msg });
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

  // Normalize — ensure all 18 cols exist
  records = records.map(r => {
    const rec = r.record || {};
    COLS.forEach(c => { if (rec[c] == null) rec[c] = ''; });
    return { action: r.action || 'need-check', note: r.note || '', record: rec };
  });

  return res.json({ ok: true, records, count: records.length, fpCount: fp.count });
}
