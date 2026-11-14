import { loadGas } from './gas-emulator.mjs'
const gas = loadGas({ csvPath: './sheet.csv', codePath: '../backend/Code.gs' })
const before = gas.sheet.data().map(r => r.slice(0, 14).join('\u0001'))
const post = (o) => JSON.parse(gas.api.doPost({ postData: { contents: JSON.stringify(o) } }).body)
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m) } }

// before setup, list requires setup; unauth rejected
ok(post({ action: 'list' }).error === 'unauthorized', 'unauth list rejected')
ok(post({ action: 'list', session: 'x.y' }).error === 'unauthorized', 'forged session rejected')

gas.api.setup()
gas.api.setup() // idempotent
const hdr = gas.sheet.data()[0]
console.log('headers:', hdr.join(' | '))
ok(hdr.length === 26, 'header count 26 got ' + hdr.length)
const after = gas.sheet.data().map(r => r.slice(0, 14).join('\u0001'))
ok(JSON.stringify(before) === JSON.stringify(after), 'columns A-N untouched')

// pairing
const page = gas.api.doGet().body
const code = page.match(/>([A-Z2-9]{8})</)[1]
ok(post({ action: 'pair', code: 'WRONG123' }).error === 'bad_code', 'wrong code rejected')
const p = post({ action: 'pair', code })
ok(p.ok && p.session, 'pair ok')
ok(post({ action: 'pair', code }).ok === false, 'code single use')
const S = p.session

const l = post({ action: 'list', session: S })
ok(l.ok && l.leads.length === 27, 'list 27 got ' + l.leads?.length)
const ids = new Set(l.leads.map(x => x.id)); ok(ids.size === 27, 'unique ids')
const L0 = l.leads[0]
console.log('lead0:', JSON.stringify({ id: L0.id, status: L0.status, priority: L0.priority, budgetAmount: L0.budgetAmount, budgetCurrency: L0.budgetCurrency, postDate: L0.postDate, verification: L0.verification, sourcePostId: L0.sourcePostId, dateAdded: L0.dateAdded }))
const statuses = {}; l.leads.forEach(x => statuses[x.status] = (statuses[x.status]||0)+1); console.log('statuses', statuses)
const prs = {}; l.leads.forEach(x => prs[x.priority] = (prs[x.priority]||0)+1); console.log('priorities', prs)
console.log('budgets:', l.leads.filter(x=>x.budget).map(x => `${x.budget} → ${x.budgetCurrency} ${x.budgetAmount}`).join(' | '))
console.log('postDates:', l.leads.map(x => x.postDate || '-').join(' '))

// update with base
const u = post({ action: 'update', session: S, id: L0.id, changes: { status: 'CONTACTED', notes: 'Contacted on Nov 14' }, base: { status: L0.status, notes: L0.notes } })
ok(u.ok && u.lead.status === 'CONTACTED' && u.lead.notes === 'Contacted on Nov 14', 'update ok')
const row = gas.sheet.data()[L0.row - 1]
ok(row[10] === 'נוצר קשר', 'status written in Hebrew: ' + row[10])
// stale base -> conflict
const c = post({ action: 'update', session: S, id: L0.id, changes: { notes: 'x' }, base: { notes: L0.notes } })
ok(c.error === 'conflict' && c.lead.notes === 'Contacted on Nov 14', 'conflict detected')
// validation
ok(post({ action: 'update', session: S, id: L0.id, changes: { status: 'BAD' } }).error === 'server_error', 'bad enum rejected')
ok(post({ action: 'update', session: S, id: L0.id, changes: { followUpDate: '14/11' } }).error === 'server_error', 'bad date rejected')
ok(post({ action: 'update', session: S, id: L0.id, changes: { row: 5 } }).error === 'server_error', 'non-editable rejected')
const fx = post({ action: 'update', session: S, id: L0.id, changes: { notes: '=IMPORTDATA("x")' }, base: { notes: 'Contacted on Nov 14' } })
ok(fx.ok && gas.sheet.data()[L0.row - 1][13] === '=IMPORTDATA("x")' , 'formula stored as text')
// follow-up & archived
const f = post({ action: 'update', session: S, id: L0.id, changes: { followUpDate: '2026-11-17', archived: true, weddingType: 'KOSHER' } })
ok(f.ok && f.lead.followUpDate === '2026-11-17' && f.lead.archived === true && f.lead.weddingType === 'KOSHER', 'followup/archived/type')

// duplicates
const dupUrl = 'https://old.reddit.com/r/BigBudgetBrides/comments/1x6qyrw/whatever/?utm=1'
ok(post({ action: 'checkUrl', session: S, url: dupUrl }).duplicate?.id === L0.id, 'dup by post id')
ok(post({ action: 'create', session: S, lead: { url: dupUrl, title: 'x' } }).error === 'duplicate', 'create dup rejected')
const cr = post({ action: 'create', session: S, lead: { url: 'https://www.facebook.com/groups/abc/posts/123', source: 'Facebook', title: 'Kosher wedding in Cyprus', budget: '€60,000', priority: 'HIGH', status: 'NEW' } })
ok(cr.ok && cr.lead.id && cr.lead.budgetAmount === 60000 && cr.lead.verification === 'VERIFIED', 'create ok')
ok(post({ action: 'list', session: S }).leads.length === 28, 'now 28')

// row added by automation without ID gets one
const d = gas.sheet.data(); const newRow = new Array(d[0].length).fill(''); newRow[3] = 'Automation lead'; newRow[11] = 'https://www.reddit.com/r/x/comments/zzz111/a/'; newRow[7] = '$80K'; d.push(newRow)
const l2 = post({ action: 'list', session: S })
const auto = l2.leads.find(x => x.title === 'Automation lead')
ok(auto && auto.id && auto.budgetAmount === 80000 && auto.budgetCurrency === 'USD', 'automation row gets id + parsed budget')
ok(post({ action: 'list', session: S }).leads.find(x => x.title === 'Automation lead').id === auto.id, 'id stable')

// logout all
post({ action: 'logoutAll', session: S })
ok(post({ action: 'list', session: S }).error === 'unauthorized', 'logoutAll revokes')
// non-owner doGet
const g2 = (await import('./gas-emulator.mjs')).loadGas({ csvPath: './sheet.csv', codePath: '../backend/Code.gs', activeUser: '' })
ok(/Not authorized/.test(g2.api.doGet().body), 'anonymous doGet blocked')
console.log(`\n${pass} passed, ${fail} failed`)
