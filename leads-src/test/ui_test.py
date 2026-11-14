"""
End-to-end UI smoke test for KAI LEADS against the local Apps Script emulator.

Prereqs (see README.md → Testing):
  1. test/sheet.csv   — CSV export of the "REDDIT LEADS" sheet (git-ignored; never commit lead data)
  2. node test/server.mjs                      → emulator API on http://localhost:8787
  3. npm --prefix app run build:site
     mkdir -p /tmp/site && rm -rf /tmp/site/leads && cp -r app/dist /tmp/site/leads
     (cd /tmp/site && python3 -m http.server 4181)
  4. pip install playwright && python3 -m playwright install chromium
Run: python3 test/ui_test.py   (screenshots → test/shots/)
"""
import os
import re
import urllib.request

from playwright.sync_api import sync_playwright

API = 'http://localhost:8787'
APP = 'http://localhost:4181/leads/'
os.makedirs(os.path.join(os.path.dirname(__file__), 'shots'), exist_ok=True)
SHOT = lambda name: os.path.join(os.path.dirname(__file__), 'shots', name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['iPhone 13'])
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    # Point the app at the emulator instead of the production Apps Script URLs.
    pg.route('**/leads/config.json', lambda r: r.fulfill(json={'apiUrl': API, 'signInUrl': API}))

    pg.goto(APP)
    pg.wait_for_timeout(800)
    code = re.search(r'>([A-Z2-9]{8})<', urllib.request.urlopen(API).read().decode()).group(1)
    pg.fill('input[placeholder="ABCD2345"]', code)
    pg.click('button:text-is("כניסה")')
    pg.wait_for_timeout(1500)
    pg.screenshot(path=SHOT('01-list.png'))
    seg = lambda: pg.locator('header').inner_text().replace('\n', ' ')
    print('tabs:', seg())

    # Swipe the first card to the right → "פניתי", then undo.
    card = pg.locator('main .relative.overflow-hidden').first
    bb = card.bounding_box()
    y = bb['y'] + bb['height'] / 2
    pg.mouse.move(bb['x'] + 60, y)
    pg.mouse.down()
    for i in range(1, 12):
        pg.mouse.move(bb['x'] + 60 + i * 15, y)
    pg.mouse.up()
    pg.wait_for_timeout(1200)
    print('after swipe:', seg())
    pg.click('button:text-is("בטל")')
    pg.wait_for_timeout(1200)
    print('after undo:', seg())

    # Lead screen: quick-note phrase + "פניתי".
    pg.locator('main button.text-start').first.click()
    pg.wait_for_timeout(400)
    pg.click('text=+ שלחתי הודעה פרטית')
    pg.wait_for_timeout(1200)
    print('notes tail:', pg.locator('textarea').input_value()[-40:])
    pg.click('button:text-is("פניתי")')
    pg.wait_for_timeout(1200)
    pg.screenshot(path=SHOT('02-detail.png'), full_page=True)
    pg.click('text=חזרה')

    # Follow-ups tab.
    pg.click('nav >> text=מעקבים')
    pg.wait_for_timeout(300)
    pg.screenshot(path=SHOT('03-followups.png'))

    # Quick add from a link only.
    pg.click('nav >> text=לידים')
    pg.click('button[aria-label="ליד חדש"]')
    pg.fill('input[placeholder^="https://www.reddit.com"]', 'https://www.reddit.com/r/test/comments/zz9test/example_post_title/')
    pg.click('button:has-text("הוסף ליד")')
    pg.wait_for_timeout(1200)
    print('added:', pg.locator('h1').inner_text())

    print('page errors:', errors)
    b.close()
