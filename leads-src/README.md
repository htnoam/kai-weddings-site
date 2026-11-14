# KAI LEADS — source

Private, mobile-first (iPhone, Hebrew / RTL) lead manager for KAI Events.
Data lives in the Google Sheet **"KAI LEADS — Reddit Pipeline"**; a Google Apps Script web app is the API.

- Production: https://weddings.kaiwedd.com/leads/
- Built output (what is served): [`/leads`](../leads) in this repo
- Source (this folder): `/leads-src`
- Full technical handover: [HANDOVER.md](./HANDOVER.md)

```
leads-src/
├── app/        React + TypeScript + Tailwind + Vite frontend (PWA)
├── backend/    Code.gs — Apps Script backend (copy of what is deployed in Apps Script)
├── test/       Apps Script emulator + backend tests + UI smoke test
├── .env.example
├── HANDOVER.md
└── README.md
```

## Requirements

- Node.js 22+ and npm
- (UI test only) Python 3 + Playwright

## Install

```bash
cd leads-src/app
npm ci
```

## Run locally

```bash
npm run dev          # http://localhost:5173
```

The dev server talks to the URLs in `app/public/config.json`, i.e. the **production** Apps Script API and the **real sheet**.
Edits you make while testing are real. For safe testing use the emulator (below).

## Testing (safe — never touches the real sheet)

1. Export the sheet tab "REDDIT LEADS" as CSV to `leads-src/test/sheet.csv` (git-ignored — never commit it).
2. Backend logic tests (runs `backend/Code.gs` in a local Apps Script emulator):
   ```bash
   cd leads-src/test && node backend.test.mjs
   ```
   Note: a few assertions assume the original snapshot (27 data rows, columns A–N only). Adjust them if the CSV differs.
3. UI smoke test against the emulator: see the header of `test/ui_test.py`.
4. Type check: `cd leads-src/app && npx tsc --noEmit -p .`

## Build for production

```bash
cd leads-src/app
npm run build:site    # = tsc -b && vite build --base=/leads/
```

Output: `leads-src/app/dist/`. The base path **must** be `/leads/` (absolute), otherwise assets break at `/leads` without a trailing slash.

## Deploy (frontend)

The site is served as static files from the repo root by Netlify, which deploys automatically on every push to `main`.
There is **no build step on the server** — the built files are committed.

```bash
# from the repo root
rm -rf leads && cp -r leads-src/app/dist leads
git add -A leads leads-src
git commit -m "KAI LEADS: <what changed>"
git push origin main
```

`leads/config.json` comes from `app/public/config.json` — keep the two production URLs in it.

## Deploy (backend)

`backend/Code.gs` is **not** deployed by git. It lives in the Apps Script project "KAI LEADS" (owner: htnoam@gmail.com).
To update: open the project → replace the code → Save → **Deploy → Manage deployments → edit each of the two deployments → Version: New version → Deploy**.
Editing existing deployments keeps both URLs unchanged. Never create new deployments unless you also update `config.json`.

## Rules that keep the sheet safe

- Columns are found **by header name**. Never rename/delete the Hebrew headers in row 1.
- New columns may be added anywhere; they show up read-only under "פרטים נוספים".
- Status/priority/etc. are stored as Hebrew labels (see HANDOVER.md §4).
- The app never deletes rows.
