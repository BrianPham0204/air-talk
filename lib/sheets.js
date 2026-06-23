import { google } from 'googleapis';

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function rowsToObjects(rows, keyCol) {
  if (!rows || rows.length < 2) return [];
  const key = keyCol.toLowerCase();
  let headerRow = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].map(c => String(c).trim().toLowerCase()).includes(key)) {
      headerRow = i;
      break;
    }
  }
  const headers = rows[headerRow].map(h => String(h).trim());
  return rows.slice(headerRow + 1)
    .filter(row => row.some(c => c !== '' && c != null))
    .map(row => {
      const obj = {};
      headers.forEach((h, j) => { if (h) obj[h] = row[j] == null ? '' : String(row[j]); });
      return obj;
    });
}

export async function getSheetData() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const id = process.env.SPREADSHEET_ID;

  const [policiesRes, categoriesRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'policies' }),
    sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'categories' }),
  ]);

  const all = rowsToObjects(policiesRes.data.values, 'code');
  return {
    policies:   all.filter(r => !r.node_id || r.node_id === ''),
    processes:  all.filter(r => r.node_id && r.node_id !== ''),
    categories: rowsToObjects(categoriesRes.data.values, 'cat_code'),
  };
}

export async function setSheetFlag(code, flagged) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const id = process.env.SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'policies' });
  const rows = res.data.values;
  if (!rows) throw new Error('Sheet trống.');

  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].map(c => String(c).trim().toLowerCase()).includes('code')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) throw new Error('Không tìm thấy header row.');

  const headers = rows[headerRow].map(h => String(h).trim());
  const codeCol = headers.indexOf('code');
  let flagCol = headers.indexOf('flagged');

  if (flagCol === -1) {
    flagCol = headers.length;
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `policies!${colLetter(flagCol + 1)}${headerRow + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['flagged']] },
    });
  }

  for (let r = headerRow + 1; r < rows.length; r++) {
    if (String(rows[r][codeCol] || '').trim() === String(code).trim()) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `policies!${colLetter(flagCol + 1)}${r + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[flagged ? 'TRUE' : 'FALSE']] },
      });
      return { ok: true, code, flagged };
    }
  }
  throw new Error('Không tìm thấy code: ' + code);
}

function colLetter(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Shared: read raw sheet rows + locate header
async function readPoliciesRaw(sheets, id) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'policies' });
  const rows = res.data.values || [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].map(c => String(c).trim().toLowerCase()).includes('code')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) throw new Error('Không tìm thấy header row trong sheet policies.');
  const headers = rows[headerIdx].map(h => String(h).trim());
  return { rows, headers, headerIdx };
}

export async function buildFingerprint() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const id = process.env.SPREADSHEET_ID;
  const { rows, headers, headerIdx } = await readPoliciesRaw(sheets, id);

  const codeCol = headers.indexOf('code');
  const pick = ['category', 'keyword', 'status', 'last_updated', 'hot'];
  const pickIdx = pick.map(p => headers.indexOf(p));

  const codes = {};
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const code = String(row[codeCol] || '').trim();
    if (!code) continue;
    const entry = { _row: r + 1 }; // 1-based sheet row
    pick.forEach((p, i) => { entry[p] = String(row[pickIdx[i]] || ''); });
    // last writer wins for duplicates — caller will see _row of latest
    codes[code] = entry;
  }

  return { generated: new Date().toISOString(), count: Object.keys(codes).length, headers, codes };
}

export async function getRowsByCodes(codeList) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const id = process.env.SPREADSHEET_ID;
  const { rows, headers, headerIdx } = await readPoliciesRaw(sheets, id);

  const codeCol = headers.indexOf('code');
  const wanted = new Set(codeList.map(c => String(c).trim()));
  const result = {};

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const code = String(rows[r][codeCol] || '').trim();
    if (!wanted.has(code)) continue;
    const obj = { _row: r + 1 };
    headers.forEach((h, j) => { if (h) obj[h] = rows[r][j] == null ? '' : String(rows[r][j]); });
    if (!result[code]) result[code] = [];
    result[code].push(obj); // keep all duplicates so caller can see conflict
  }

  return result;
}

export async function bulkWrite(records) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const id = process.env.SPREADSHEET_ID;
  const { rows, headers, headerIdx } = await readPoliciesRaw(sheets, id);

  const codeCol = headers.indexOf('code');
  const COLS = ['code','category','keyword','tags','summary_main','when_to_use','check',
    'script_en','source_file','source_link','status','last_updated','hot',
    'tree_code','node_id','node_type','options','flagged'];

  function recordToRow(rec) {
    return COLS.map(c => rec[c] != null ? String(rec[c]) : '');
  }

  const added = [], replaced = [], errors = [];

  for (const { action, record } of records) {
    const code = String(record.code || '').trim();
    if (!code) { errors.push('Missing code'); continue; }

    if (action === 'add') {
      await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: 'policies',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [recordToRow(record)] },
      });
      added.push(code);

    } else if (action === 'replace') {
      // Find ALL rows with this code and update the last one, delete extras
      const matchRows = [];
      for (let r = headerIdx + 1; r < rows.length; r++) {
        if (String(rows[r][codeCol] || '').trim() === code) matchRows.push(r + 1);
      }
      if (!matchRows.length) { errors.push(`code not found: ${code}`); continue; }

      // Update last match
      const targetRow = matchRows[matchRows.length - 1];
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `policies!A${targetRow}:R${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [recordToRow(record)] },
      });

      // Clear duplicate rows (older matches), from bottom up to preserve row indices
      for (let i = matchRows.length - 2; i >= 0; i--) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId: 0, dimension: 'ROWS', startIndex: matchRows[i] - 1, endIndex: matchRows[i] },
              },
            }],
          },
        });
      }
      replaced.push(code);
    }
  }

  return { added, replaced, errors };
}
