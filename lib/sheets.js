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
