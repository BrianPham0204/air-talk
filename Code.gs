/**
 * AirTalk CS Assistant — backend (auth + data tra cứu + relay chat).
 * Một web app, login chung; các file HTML tách riêng và ghép bằng include().
 *
 * Chuẩn bị 1 lần:
 *  1) Project Settings → Script properties → ADMIN_SECRET = <chuỗi bí mật>.
 *  2) Từ editor: addUser('<ADMIN_SECRET>','username','matkhau','Tên hiển thị','agent').
 *  3) Deploy web app: Execute as Me · Anyone with the link.
 *
 * Files HTML: Index, Styles, Login, Chat, Scripts.
 */

var SESSION_TTL = 28800;  // 8h
var MAX_FAILS   = 8;
var FAIL_TTL    = 300;
var CHAT_TTL    = 21600;  // 6h — chat chỉ lưu tạm
var CHAT_MAX    = 60;

/* ── routing + ghép file ── */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('AirTalk CS Assistant')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}


/* ══ AUTH ══ */
function sha256_(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return raw.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}
function requireAuth_(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  var raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) throw new Error('AUTH_REQUIRED');
  return JSON.parse(raw);
}
function login(name, code) {
  name = String(name || '').trim().slice(0, 24);
  if (!name) throw new Error('Vui lòng nhập tên hiển thị.');
  // Mã chung của team: đặt ở Project Settings → Script properties, key = TEAM_CODE.
  // Nếu KHÔNG đặt TEAM_CODE => chỉ cần nhập tên, không cần mã (không có cổng chặn).
  var want = PropertiesService.getScriptProperties().getProperty('TEAM_CODE');
  if (want && String(code || '').trim() !== want) throw new Error('Sai mã truy cập.');
  var token = Utilities.getUuid();
  var session = { user: name.toLowerCase(), name: name, role: 'agent', ts: Date.now() };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL);
  return { ok: true, token: token, name: name, role: 'agent' };
}
function logout(token) { if (token) CacheService.getScriptCache().remove('sess_' + token); return { ok: true }; }

/* ══ DATA (gate token) ══ */
function getData(token) {
  requireAuth_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var all = sheetToObjects(ss.getSheetByName('policies'), 'code');
  return {
    policies:   all.filter(function (r) { return !r.node_id || r.node_id === ''; }),
    processes:  all.filter(function (r) { return r.node_id && r.node_id !== ''; }),
    categories: sheetToObjects(ss.getSheetByName('categories'), 'cat_code')
  };
}
function setFlag(token, code, flagged) {
  requireAuth_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('policies');
  if (!sheet) throw new Error('Sheet "policies" không tìm thấy.');
  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Sheet trống.');
  var hr = 0;
  for (var i = 0; i < values.length; i++) {
    var low = values[i].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('code') >= 0) { hr = i; break; }
  }
  var headers = values[hr].map(function (h) { return String(h).trim(); });
  var codeCol = headers.indexOf('code');
  var flagCol = headers.indexOf('flagged');
  if (flagCol === -1) { flagCol = headers.length; sheet.getRange(hr + 1, flagCol + 1).setValue('flagged'); }
  for (var r = hr + 1; r < values.length; r++) {
    if (String(values[r][codeCol]).trim() === String(code).trim()) {
      sheet.getRange(r + 1, flagCol + 1).setValue(flagged ? 'TRUE' : 'FALSE');
      return { ok: true, code: code, flagged: flagged };
    }
  }
  throw new Error('Không tìm thấy code: ' + code);
}

/* ══ CHAT (gate token; danh tính lấy từ session) ══ */
function chatSan_(s) { return String(s || 'cs-floor').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 32) || 'cs-floor'; }
function chatRead_(cache, key, fb) { var v = cache.get(key); if (!v) return fb; try { return JSON.parse(v); } catch (e) { return fb; } }
function chatKeyM_(room) { return 'cm_' + room; }
function chatKeyP_(room) { return 'cp_' + room; }

function chatSend(token, room, text) {
  var sess = requireAuth_(token);
  room = chatSan_(room);
  text = String(text || '').slice(0, 500);
  if (!text) return { ok: false };
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return { ok: false, busy: true }; }
  try {
    var msgs = chatRead_(cache, chatKeyM_(room), []);
    msgs.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), user: sess.name, text: text, ts: Date.now() });
    if (msgs.length > CHAT_MAX) msgs = msgs.slice(-CHAT_MAX);
    cache.put(chatKeyM_(room), JSON.stringify(msgs), CHAT_TTL);
    var pres = chatRead_(cache, chatKeyP_(room), {});
    pres[sess.name] = Date.now();
    cache.put(chatKeyP_(room), JSON.stringify(pres), CHAT_TTL);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function chatPoll(token, room) {
  var sess = requireAuth_(token);
  room = chatSan_(room);
  var cache = CacheService.getScriptCache(), now = Date.now();
  var lock = LockService.getScriptLock();
  if (lock.tryLock(2000)) {
    try {
      var pres = chatRead_(cache, chatKeyP_(room), {});
      pres[sess.name] = now;
      Object.keys(pres).forEach(function (n) { if (now - pres[n] > 30000) delete pres[n]; });
      cache.put(chatKeyP_(room), JSON.stringify(pres), CHAT_TTL);
    } finally { lock.releaseLock(); }
  }
  var msgs = chatRead_(cache, chatKeyM_(room), []);
  var presence = chatRead_(cache, chatKeyP_(room), {});
  var online = Object.keys(presence).filter(function (n) { return now - presence[n] < 12000; }).sort();
  return { messages: msgs, online: online, me: sess.name };
}
function chatLeave(token, room) {
  var sess = requireAuth_(token); room = chatSan_(room);
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  if (lock.tryLock(2000)) {
    try { var pres = chatRead_(cache, chatKeyP_(room), {}); delete pres[sess.name]; cache.put(chatKeyP_(room), JSON.stringify(pres), CHAT_TTL); } finally { lock.releaseLock(); }
  }
  return { ok: true };
}

/* ── giữ nguyên ── */
function sheetToObjects(sheet, keyCol) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  keyCol = String(keyCol || '').toLowerCase();
  var hr = 0;
  for (var i = 0; i < values.length; i++) {
    var low = values[i].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf(keyCol) >= 0) { hr = i; break; }
  }
  var headers = values[hr].map(function (h) { return String(h).trim(); });
  return values.slice(hr + 1)
    .filter(function (row) { return row.some(function (c) { return c !== '' && c !== null; }); })
    .map(function (row) {
      var o = {};
      headers.forEach(function (h, j) { if (h) o[h] = row[j] == null ? '' : String(row[j]); });
      return o;
    });
}