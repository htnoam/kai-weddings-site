// Minimal Google Apps Script emulator to run backend/Code.gs locally against
// a copy of the real sheet (CSV export). Used for testing only.
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import http from 'node:http'

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export function createSheet(grid) {
  let data = grid.map((r) => r.map(String))
  let maxRows = Math.max(1000, data.length), maxCols = Math.max(26, data[0].length)
  const lastRow = () => { for (let r = data.length - 1; r >= 0; r--) if (data[r].some((v) => v !== '')) return r + 1; return 0 }
  const lastCol = () => { let m = 0; data.forEach((r) => r.forEach((v, i) => { if (v !== '') m = Math.max(m, i + 1) })); return m }
  const ensure = (r, c) => { while (data.length < r) data.push([]); data.forEach((row) => { while (row.length < c) row.push('') }) }
  const display = (v) => {
    if (v === true) return 'TRUE'; if (v === false) return 'FALSE'
    let s = String(v ?? '')
    if (s.startsWith("'")) s = s.slice(1)
    return s
  }
  const range = (r, c, nr = 1, nc = 1) => ({
    getDisplayValues() { ensure(r + nr - 1, c + nc - 1); return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => display(data[r - 1 + i][c - 1 + j]))) },
    setValue(v) { ensure(r, c); data[r - 1][c - 1] = display(v); return this },
    setValues(vs) { ensure(r + nr - 1, c + nc - 1); vs.forEach((row, i) => row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = display(v) })); return this },
    setNumberFormat() { return this },
    copyFormatToRange() { return this },
  })
  return {
    data: () => data,
    getRange: range,
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getMaxRows: () => maxRows,
    getMaxColumns: () => maxCols,
    insertColumnAfter: () => { maxCols++ },
  }
}

export function loadGas({ csvPath, codePath, activeUser = 'htnoam@gmail.com' }) {
  const sheet = createSheet(parseCsv(fs.readFileSync(csvPath, 'utf8')).filter((r) => r.some((v) => v !== '')))
  const props = {}, cache = new Map()
  const b64ws = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (n === 'REDDIT LEADS' ? sheet : null) }), flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null }, put: (k, v, s) => cache.set(k, { v, exp: Date.now() + s * 1000 }), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe: (v) => b64ws(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v)),
      base64DecodeWebSafe: (s) => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')],
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()],
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
      formatDate: (d) => d.toISOString().slice(0, 10),
    },
    Session: { getActiveUser: () => ({ getEmail: () => activeUser }) },
    Logger: { log: (m) => console.log('[Logger]', m) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType() { return this }, body: s }) },
    HtmlService: { createHtmlOutput: (s) => ({ setTitle() { return this }, addMetaTag() { return this }, body: s }) },
  }
  vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(codePath, 'utf8') + '\n;globalThis.__api={doGet,doPost,setup};', ctx)
  return { api: ctx.__api, sheet, cache }
}

export function serve(gas, port) {
  return http
    .createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*' }
      if (req.method === 'GET') {
        res.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(gas.api.doGet().body)
      }
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const out = gas.api.doPost({ postData: { contents: body } })
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
        res.end(out.body)
      })
    })
    .listen(port)
}
