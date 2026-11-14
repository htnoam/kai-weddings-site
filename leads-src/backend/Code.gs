/**
 * KAI LEADS — Google Apps Script backend
 * The Google Sheet stays the single source of truth.
 *
 * Deploy this script TWICE (Deploy → New deployment → Web app), same code:
 *   1) API      — Execute as: Me · Who has access: Anyone
 *                 (every call except sign-in requires a signed session token)
 *   2) Sign-in  — Execute as: Me · Who has access: Only myself
 *                 (Google login enforced; shows a one-time code for the app)
 *
 * Run setup() once from the editor before first use.
 */

const SPREADSHEET_ID = '1js5d2Deq0HpuKZoSYDMnsG1uuZj0UCGhAz96Xa9ZAyA';
const SHEET_NAME = 'REDDIT LEADS';
const ALLOWED_EMAIL = 'htnoam@gmail.com';
const TZ = 'Asia/Jerusalem';
const SESSION_DAYS = 90;
const PAIR_CODE_TTL_SEC = 600;
const MAX_TEXT = 10000;

/* ───────────── Field definitions ─────────────
 * Columns are found by header name, never by position.
 * The first header name is the one written when a column is added.
 */
const FIELDS = [
  { key: 'discoveryDate', headers: ['תאריך איתור', 'Discovery Date'], type: 'date' },
  { key: 'source', headers: ['מקור', 'Source'] },
  { key: 'community', headers: ['קהילה', 'Community'] },
  { key: 'title', headers: ['כותרת הפוסט', 'Post Title', 'Title'] },
  { key: 'destination', headers: ['יעד', 'Destination'] },
  { key: 'weddingDate', headers: ['תאריך חתונה', 'Wedding Date'] },
  { key: 'guests', headers: ['אורחים', 'Guest Count', 'Guests'] },
  { key: 'budget', headers: ['תקציב', 'Budget'] },
  { key: 'plannerBudget', headers: ['תקציב מפיק', 'Planner Budget'] },
  { key: 'priority', headers: ['דירוג', 'Priority'], type: 'enum', enumName: 'PRIORITY' },
  { key: 'status', headers: ['סטטוס', 'Status'], type: 'enum', enumName: 'STATUS' },
  { key: 'url', headers: ['קישור לפוסט', 'Original Post URL', 'URL'], type: 'url' },
  { key: 'description', headers: ['תיאור / צורך', 'Description / Requirements', 'Description'] },
  { key: 'notes', headers: ['הערות טיפול', 'Internal Notes', 'Notes'] },
  // Added by setup()
  { key: 'id', headers: ['מזהה ליד', 'Lead ID'], added: true },
  { key: 'weddingType', headers: ['סוג חתונה', 'Wedding Type'], type: 'enum', enumName: 'WEDDING_TYPE', added: true },
  { key: 'followUpDate', headers: ['תאריך מעקב', 'Follow-up Date'], type: 'date', added: true },
  { key: 'lastContactDate', headers: ['תאריך קשר אחרון', 'Last Contact Date'], type: 'date', added: true },
  { key: 'lastUpdated', headers: ['עדכון אחרון', 'Last Updated'], added: true },
  { key: 'dateAdded', headers: ['תאריך הוספה', 'Date Added'], type: 'date', added: true },
  { key: 'postDate', headers: ['תאריך פרסום', 'Post Publication Date'], type: 'date', added: true },
  { key: 'archived', headers: ['בארכיון', 'Archived'], type: 'bool', added: true },
  { key: 'sourcePostId', headers: ['מזהה פוסט', 'Source Post ID'], added: true },
  { key: 'budgetCurrency', headers: ['מטבע תקציב', 'Budget Currency'], added: true },
  { key: 'budgetAmount', headers: ['סכום תקציב', 'Budget Amount'], type: 'number', added: true },
  { key: 'verification', headers: ['סטטוס אימות', 'Verification Status'], type: 'enum', enumName: 'VERIFICATION', added: true },
];

/* Enum values: code → [label written to the sheet, ...accepted aliases] */
const ENUMS = {
  STATUS: {
    NEW: ['חדש', 'new'],
    REVIEWED: ['נבדק', 'reviewed'],
    CONTACTED: ['נוצר קשר', 'contacted', 'פניתי'],
    FOLLOW_UP: ['למעקב', 'follow up', 'follow-up', 'followup'],
    IN_CONVERSATION: ['בשיחה', 'in conversation'],
    WON: ['נסגר', 'won', 'לקוח'],
    LOST: ['אבד', 'lost'],
    NOT_RELEVANT: ['לא רלוונטי', 'not relevant', 'dismissed'],
  },
  PRIORITY: {
    VERY_HIGH: ['גבוה מאוד', 'very high'],
    HIGH: ['גבוה', 'high'],
    MEDIUM: ['בינוני', 'medium'],
    LOW: ['נמוך', 'low'],
  },
  WEDDING_TYPE: {
    JEWISH: ['יהודית', 'jewish'],
    KOSHER: ['כשרה', 'kosher'],
    GLATT_KOSHER: ['כשר למהדרין', 'glatt kosher', 'גלאט'],
    GENERAL: ['כללית', 'general'],
  },
  VERIFICATION: {
    VERIFIED: ['מאומת', 'verified'],
    NEEDS_REVIEW: ['דורש בדיקה', 'needs review'],
    UNVERIFIED: ['לא מאומת', 'unverified'],
  },
};

const EDITABLE = [
  'status', 'priority', 'notes', 'followUpDate', 'lastContactDate', 'destination', 'weddingDate',
  'budget', 'budgetAmount', 'budgetCurrency', 'guests', 'weddingType', 'verification', 'archived',
  'title', 'description', 'plannerBudget', 'source', 'community', 'url', 'postDate',
];

/* ───────────── HTTP entry points ───────────── */

function doGet() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (email !== ALLOWED_EMAIL) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Not authorized.</p>');
  }
  const code = newPairCode_();
  const html =
    '<div style="font-family:-apple-system,Helvetica,sans-serif;text-align:center;padding:40px 16px">' +
    '<div style="font-weight:700;letter-spacing:.08em">KAI LEADS</div>' +
    '<p style="color:#555">Your sign-in code (valid 10 minutes, one use):</p>' +
    '<div style="font-size:40px;font-weight:700;letter-spacing:.15em;user-select:all;-webkit-user-select:all;' +
    'padding:16px;border:1px solid #ddd;border-radius:12px;margin:16px auto;max-width:320px">' + code + '</div>' +
    '<p style="color:#555">Copy it, go back to the KAI LEADS app and paste it.</p></div>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('KAI LEADS sign-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 200000) return json_({ ok: false, error: 'bad_request' });
    const req = JSON.parse(raw);
    if (req.action === 'pair') return json_(pair_(req.code));
    if (!verifySession_(req.session)) return json_({ ok: false, error: 'unauthorized' });
    switch (req.action) {
      case 'list': return json_(list_());
      case 'update': return json_(update_(req.id, req.changes, req.base));
      case 'create': return json_(create_(req.lead));
      case 'checkUrl': return json_(checkUrl_(req.url));
      case 'logoutAll': bumpSessionVersion_(); return json_({ ok: true });
      default: return json_({ ok: false, error: 'bad_request' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────── Authentication ───────────── */

function props_() { return PropertiesService.getScriptProperties(); }

function secret_() {
  let s = props_().getProperty('SESSION_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props_().setProperty('SESSION_SECRET', s);
  }
  return s;
}

function sessionVersion_() { return props_().getProperty('SESSION_VERSION') || '1'; }

function bumpSessionVersion_() {
  props_().setProperty('SESSION_VERSION', String(Number(sessionVersion_()) + 1));
}

function sign_(payloadB64) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, secret_()));
}

function makeSession_() {
  const payload = { e: ALLOWED_EMAIL, x: Date.now() + SESSION_DAYS * 864e5, v: sessionVersion_() };
  const p = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  return p + '.' + sign_(p);
}

function verifySession_(token) {
  if (!token || typeof token !== 'string' || token.length > 2000) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  if (sign_(parts[0]) !== parts[1]) return false;
  try {
    const pl = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    return pl.e === ALLOWED_EMAIL && pl.x > Date.now() && pl.v === sessionVersion_();
  } catch (_) {
    return false;
  }
}

function newPairCode_() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  CacheService.getScriptCache().put('pair:' + code, '1', PAIR_CODE_TTL_SEC);
  return code;
}

function pair_(code) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pairfail') || 0);
  if (fails >= 10) return { ok: false, error: 'locked', message: 'Too many attempts. Wait 15 minutes.' };
  const c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length === 8 && cache.get('pair:' + c)) {
    cache.remove('pair:' + c);
    return { ok: true, session: makeSession_(), email: ALLOWED_EMAIL };
  }
  cache.put('pairfail', String(fails + 1), 900);
  return { ok: false, error: 'bad_code', message: 'Code is wrong or expired.' };
}

/** Run from the editor to sign out every device. */
function signOutAllDevices() { bumpSessionVersion_(); }

/* ───────────── Sheet helpers ───────────── */

function sheet_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  return sh;
}

function norm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

/** Finds the header row (first row in the top 5 that matches ≥3 known headers). */
function layout_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const top = sh.getRange(1, 1, Math.min(5, Math.max(sh.getLastRow(), 1)), lastCol).getDisplayValues();
  const known = {};
  FIELDS.forEach(function (f) { f.headers.forEach(function (h) { known[norm_(h)] = f.key; }); });
  let headerRow = 1, best = -1;
  top.forEach(function (row, i) {
    const n = row.filter(function (v) { return known[norm_(v)]; }).length;
    if (n > best) { best = n; headerRow = i + 1; }
  });
  const headers = top[headerRow - 1] || [];
  const col = {};      // field key → 0-based column index
  const extra = {};    // unknown header → 0-based column index
  headers.forEach(function (h, i) {
    const k = known[norm_(h)];
    if (k && col[k] === undefined) col[k] = i;
    else if (String(h).trim()) extra[String(h).trim()] = i;
  });
  return { headerRow: headerRow, lastCol: lastCol, col: col, extra: extra };
}

function fieldDef_(key) { return FIELDS.filter(function (f) { return f.key === key; })[0]; }

function enumCode_(enumName, raw) {
  const v = norm_(raw);
  if (!v) return null;
  const m = ENUMS[enumName];
  for (const code in m) {
    if (m[code].some(function (a) { return norm_(a) === v; })) return code;
  }
  return undefined; // unrecognized
}

function enumLabel_(enumName, code) { return ENUMS[enumName][code][0]; }

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** Converts a sheet date display value to yyyy-MM-dd when recognizable. */
function toIsoDate_(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]);
  return s;
}

function pad_(n) { return ('0' + n).slice(-2); }

function parseBudget_(text) {
  const t = String(text || '');
  if (!t.trim()) return { currency: '', amount: null };
  const currency = /€|eur|יורו/i.test(t) ? 'EUR' : /\$|usd|דולר/i.test(t) ? 'USD' : /£|gbp/i.test(t) ? 'GBP' : /₪|ils|nis|ש"ח|שקל/i.test(t) ? 'ILS' : '';
  const nums = (t.replace(/,/g, '').match(/\d+(?:\.\d+)?\s*[kK]?/g) || []).map(function (s) {
    let n = parseFloat(s);
    if (/k/i.test(s)) n *= 1000;
    return n;
  }).filter(function (n) { return n >= 100; });
  return { currency: currency, amount: nums.length ? Math.max.apply(null, nums) : null };
}

function postIdFromUrl_(url) {
  const m = String(url || '').match(/\/comments\/([a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/** Dedup key: reddit post id when present, otherwise a normalized URL. */
function urlKey_(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  const pid = postIdFromUrl_(u);
  if (pid && /reddit\.com|redd\.it/i.test(u)) return 'reddit:' + pid;
  return u.toLowerCase().replace(/^https?:\/\//, '').replace(/^(www|m|old|new|mobile)\./, '')
    .replace(/[?#].*$/, '').replace(/\/+$/, '');
}

function safeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function newId_(existing) {
  let id;
  do { id = 'L-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); } while (existing[id]);
  existing[id] = true;
  return id;
}

/* ───────────── Serialization ───────────── */

function rowToLead_(row, rowNumber, L) {
  const get = function (k) { return L.col[k] === undefined ? '' : String(row[L.col[k]] || '').trim(); };
  const lead = { row: rowNumber, extra: {} };
  FIELDS.forEach(function (f) {
    const v = get(f.key);
    if (f.type === 'enum') {
      const code = enumCode_(f.enumName, v);
      lead[f.key + 'Raw'] = v;
      lead[f.key] = code === undefined ? null : code;
    } else if (f.type === 'bool') {
      lead[f.key] = /^(true|כן|yes|1|אמת|v|✓)$/i.test(v);
    } else if (f.type === 'number') {
      const n = parseFloat(v.replace(/[^\d.]/g, ''));
      lead[f.key] = isNaN(n) ? null : n;
    } else if (f.type === 'date') {
      lead[f.key] = toIsoDate_(v);
    } else {
      lead[f.key] = v;
    }
  });
  if (!lead.statusRaw) lead.status = 'NEW';
  if (!lead.budgetCurrency && lead.budgetAmount === null && lead.budget) {
    const b = parseBudget_(lead.budget);
    lead.budgetCurrency = b.currency;
    lead.budgetAmount = b.amount;
  }
  if (!lead.sourcePostId) lead.sourcePostId = postIdFromUrl_(lead.url);
  Object.keys(L.extra).forEach(function (h) {
    const v = String(row[L.extra[h]] || '').trim();
    if (v) lead.extra[h] = v;
  });
  return lead;
}

function isEmptyRow_(row, L) {
  return ['title', 'url', 'description'].every(function (k) {
    return L.col[k] === undefined || !String(row[L.col[k]] || '').trim();
  });
}

/* ───────────── Actions ───────────── */

function list_() {
  const sh = sheet_();
  const L = layout_(sh);
  if (L.col.id === undefined) throw new Error('Run setup() first — Lead ID column is missing.');
  const lastRow = sh.getLastRow();
  if (lastRow <= L.headerRow) return { ok: true, leads: [], serverTime: new Date().toISOString() };
  const values = sh.getRange(L.headerRow + 1, 1, lastRow - L.headerRow, L.lastCol).getDisplayValues();

  // New rows (e.g. added by research automation) get an ID on first read.
  const missing = [];
  values.forEach(function (r, i) { if (!isEmptyRow_(r, L) && !String(r[L.col.id]).trim()) missing.push(i); });
  if (missing.length) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const idRange = sh.getRange(L.headerRow + 1, L.col.id + 1, values.length, 1);
      const ids = idRange.getDisplayValues();
      const existing = {};
      ids.forEach(function (r) { if (r[0]) existing[r[0]] = true; });
      missing.forEach(function (i) {
        if (!String(ids[i][0]).trim()) {
          const id = newId_(existing);
          sh.getRange(L.headerRow + 1 + i, L.col.id + 1).setValue(id);
          values[i][L.col.id] = id;
          if (L.col.dateAdded !== undefined && !String(values[i][L.col.dateAdded]).trim()) {
            sh.getRange(L.headerRow + 1 + i, L.col.dateAdded + 1).setValue(today_());
          }
        }
      });
    } finally {
      lock.releaseLock();
    }
  }

  const leads = [];
  values.forEach(function (r, i) {
    if (!isEmptyRow_(r, L)) leads.push(rowToLead_(r, L.headerRow + 1 + i, L));
  });
  return {
    ok: true,
    leads: leads,
    serverTime: new Date().toISOString(),
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit',
  };
}

function findRow_(sh, L, id) {
  const lastRow = sh.getLastRow();
  if (lastRow <= L.headerRow) return -1;
  const ids = sh.getRange(L.headerRow + 1, L.col.id + 1, lastRow - L.headerRow, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return L.headerRow + 1 + i;
  return -1;
}

function readLeadAt_(sh, L, rowNumber) {
  const r = sh.getRange(rowNumber, 1, 1, L.lastCol).getDisplayValues()[0];
  return rowToLead_(r, rowNumber, L);
}

/** Validates one field value and converts it to what is written into the sheet. */
function toCell_(key, value) {
  const f = fieldDef_(key);
  if (!f || EDITABLE.indexOf(key) < 0) throw new Error('Field not editable: ' + key);
  if (f.type === 'enum') {
    if (value === null || value === '') return '';
    if (!ENUMS[f.enumName][value]) throw new Error('Invalid value for ' + key);
    return enumLabel_(f.enumName, value);
  }
  if (f.type === 'bool') return value === true ? 'כן' : '';
  if (f.type === 'number') {
    if (value === null || value === '') return '';
    const n = Number(value);
    if (!isFinite(n) || n < 0) throw new Error('Invalid number for ' + key);
    return n;
  }
  const s = String(value === null || value === undefined ? '' : value);
  if (s.length > MAX_TEXT) throw new Error('Text too long for ' + key);
  if (f.type === 'date' && s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Invalid date for ' + key);
  if (f.type === 'url' && s && !/^https?:\/\/\S+$/i.test(s)) throw new Error('Invalid URL');
  if (key === 'budgetCurrency' && s && !/^[A-Z]{3}$/.test(s)) throw new Error('Invalid currency');
  return safeCell_(s);
}

/**
 * changes: { key: newValue }
 * base:    { key: valueTheAppSaw } — if the sheet now holds something else for any
 *          of these fields, nothing is written and the current lead is returned.
 */
function update_(id, changes, base) {
  if (!id || !changes || typeof changes !== 'object') return { ok: false, error: 'bad_request' };
  const keys = Object.keys(changes);
  if (!keys.length) return { ok: false, error: 'bad_request' };
  const cells = {};
  keys.forEach(function (k) { cells[k] = toCell_(k, changes[k]); }); // validates before locking

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const L = layout_(sh);
    const rowNumber = findRow_(sh, L, String(id));
    if (rowNumber < 0) return { ok: false, error: 'not_found', message: 'Lead not found in the sheet.' };
    const current = readLeadAt_(sh, L, rowNumber);
    if (base && typeof base === 'object') {
      const stale = Object.keys(base).filter(function (k) {
        return JSON.stringify(current[k] === undefined ? null : current[k]) !== JSON.stringify(base[k] === undefined ? null : base[k]);
      });
      if (stale.length) return { ok: false, error: 'conflict', fields: stale, lead: current };
    }
    keys.forEach(function (k) {
      if (L.col[k] === undefined) throw new Error('Column missing for ' + k + ' — run setup().');
      sh.getRange(rowNumber, L.col[k] + 1).setValue(cells[k]);
    });
    if (L.col.lastUpdated !== undefined) {
      sh.getRange(rowNumber, L.col.lastUpdated + 1).setValue(new Date().toISOString());
    }
    SpreadsheetApp.flush();
    return { ok: true, lead: readLeadAt_(sh, L, rowNumber) };
  } finally {
    lock.releaseLock();
  }
}

function findByUrl_(sh, L, url) {
  const key = urlKey_(url);
  if (!key || L.col.url === undefined) return null;
  const lastRow = sh.getLastRow();
  if (lastRow <= L.headerRow) return null;
  const urls = sh.getRange(L.headerRow + 1, L.col.url + 1, lastRow - L.headerRow, 1).getDisplayValues();
  for (let i = 0; i < urls.length; i++) {
    if (urlKey_(urls[i][0]) === key) return readLeadAt_(sh, L, L.headerRow + 1 + i);
  }
  return null;
}

function checkUrl_(url) {
  const sh = sheet_();
  return { ok: true, duplicate: findByUrl_(sh, layout_(sh), url) };
}

function create_(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'bad_request' };
  const data = {};
  Object.keys(input).forEach(function (k) {
    if (EDITABLE.indexOf(k) >= 0 && input[k] !== undefined && input[k] !== '' && input[k] !== null) data[k] = input[k];
  });
  if (!data.title && !data.url && !data.description) return { ok: false, error: 'bad_request', message: 'Add at least a URL, title or description.' };
  if (!data.status) data.status = 'NEW';
  if (!data.verification) data.verification = 'VERIFIED';
  if (data.url && !data.sourcePostId) {
    const pid = postIdFromUrl_(data.url);
    if (pid) data.sourcePostId = pid;
  }
  if (data.budget && !data.budgetCurrency && data.budgetAmount === undefined) {
    const b = parseBudget_(data.budget);
    if (b.currency) data.budgetCurrency = b.currency;
    if (b.amount !== null) data.budgetAmount = b.amount;
  }
  const cells = {};
  Object.keys(data).forEach(function (k) {
    if (k === 'sourcePostId') { cells[k] = safeCell_(String(data[k]).slice(0, 100)); return; }
    cells[k] = toCell_(k, data[k]);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const L = layout_(sh);
    if (L.col.id === undefined) throw new Error('Run setup() first.');
    if (data.url) {
      const dup = findByUrl_(sh, L, data.url);
      if (dup) return { ok: false, error: 'duplicate', lead: dup };
    }
    const lastRow = sh.getLastRow();
    const existing = {};
    if (lastRow > L.headerRow) {
      sh.getRange(L.headerRow + 1, L.col.id + 1, lastRow - L.headerRow, 1).getDisplayValues()
        .forEach(function (r) { if (r[0]) existing[r[0]] = true; });
    }
    const today = today_();
    cells.id = newId_(existing);
    cells.discoveryDate = today;
    cells.dateAdded = today;
    cells.lastUpdated = new Date().toISOString();
    const row = new Array(L.lastCol).fill('');
    Object.keys(cells).forEach(function (k) { if (L.col[k] !== undefined) row[L.col[k]] = cells[k]; });
    const target = lastRow + 1;
    sh.getRange(target, 1, 1, L.lastCol).setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true, lead: readLeadAt_(sh, L, target) };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────── One-time setup ─────────────
 * Safe to run more than once. Only appends missing columns to the right
 * and fills EMPTY cells in those new columns. Columns A–N are never changed.
 */
function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    secret_();
    const sh = sheet_();
    let L = layout_(sh);
    const headerCell = sh.getRange(L.headerRow, Math.max(1, L.lastCol));
    let added = [];
    FIELDS.filter(function (f) { return f.added && L.col[f.key] === undefined; }).forEach(function (f) {
      const c = sh.getLastColumn() + 1;
      if (c > sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
      headerCell.copyFormatToRange(sh, c, c, L.headerRow, L.headerRow);
      sh.getRange(L.headerRow, c).setValue(f.headers[0]);
      added.push(f.headers[0]);
    });
    L = layout_(sh);

    // New columns hold text so dates/IDs are never auto-converted.
    FIELDS.filter(function (f) { return f.added && f.type !== 'number'; }).forEach(function (f) {
      sh.getRange(L.headerRow + 1, L.col[f.key] + 1, sh.getMaxRows() - L.headerRow, 1).setNumberFormat('@');
    });

    const lastRow = sh.getLastRow();
    if (lastRow <= L.headerRow) { Logger.log('No data rows. Added: ' + added.join(', ')); return; }
    const n = lastRow - L.headerRow;
    const values = sh.getRange(L.headerRow + 1, 1, n, L.lastCol).getDisplayValues();
    const existing = {};
    values.forEach(function (r) { const v = String(r[L.col.id]).trim(); if (v) existing[v] = true; });

    const fill = {}; // key → column values
    ['id', 'dateAdded', 'sourcePostId', 'budgetCurrency', 'budgetAmount', 'postDate', 'verification'].forEach(function (k) {
      fill[k] = values.map(function (r) { return [r[L.col[k]]]; });
    });
    let filled = 0;
    values.forEach(function (r, i) {
      if (isEmptyRow_(r, L)) return;
      const set = function (k, v) {
        if (v === '' || v === null || v === undefined) return;
        if (!String(fill[k][i][0]).trim()) { fill[k][i][0] = v; filled++; }
      };
      set('id', String(r[L.col.id]).trim() ? '' : newId_(existing));
      set('dateAdded', toIsoDate_(r[L.col.discoveryDate]));
      set('sourcePostId', postIdFromUrl_(r[L.col.url]));
      const b = parseBudget_(r[L.col.budget]);
      set('budgetCurrency', b.currency);
      set('budgetAmount', b.amount);
      const pm = String(r[L.col.notes] || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (pm) set('postDate', pm[3] + '-' + pad_(pm[2]) + '-' + pad_(pm[1]));
      set('verification', enumLabel_('VERIFICATION', 'NEEDS_REVIEW'));
    });
    Object.keys(fill).forEach(function (k) {
      sh.getRange(L.headerRow + 1, L.col[k] + 1, n, 1).setValues(fill[k]);
    });
    SpreadsheetApp.flush();
    Logger.log('Setup done. Columns added: ' + (added.join(', ') || 'none') + '. Cells filled: ' + filled + '.');
  } finally {
    lock.releaseLock();
  }
}
