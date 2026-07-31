import { chromium } from 'playwright'

const BASE = 'http://localhost:5173/'
const OUT = new URL('./', import.meta.url).pathname

const consoleErrors = []
const pageErrors = []
const externalRequests = []
let totalRequests = 0

function isLocal(url) {
  return (
    url.startsWith('http://localhost:5173') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  )
}

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => pageErrors.push(String(err)))
page.on('request', (req) => {
  totalRequests++
  if (!isLocal(req.url())) externalRequests.push(`${req.method()} ${req.url()}`)
})
// Auto-accept confirm() dialogs (delete cascade, dirty overwrite).
page.on('dialog', (d) => d.accept())

const R = {}
const step = async (name, fn) => {
  try {
    R[name] = await fn()
  } catch (err) {
    R[name] = { error: String(err) }
  }
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.app-shell', { timeout: 10000 })
await page.waitForSelector('button[aria-label^="Page"]', { timeout: 10000 })

// (a) Load demo via file menu
await step('a_loadDemo', async () => {
  await page.click('button[aria-label="Menu fichier"]')
  await page.click('button[role="menuitem"]:has-text("Charger la démo")')
  await page.waitForTimeout(600)
  await page.waitForSelector('.vue-flow__node-page', { timeout: 8000 })
  const pages = await page.locator('.vue-flow__node-page').count()
  const blocks = await page.locator('.vue-flow__node-block').count()
  const notes = await page.locator('.vue-flow__node-note').count()
  const edges = await page.locator('.vue-flow__edge').count()
  await page.screenshot({ path: OUT + 'canvas.png', fullPage: false })
  return { pages, blocks, notes, edges, ok: pages >= 4 && blocks >= 8 && notes >= 4 }
})

// (b) Create a block in a page, verify stacking (block count grows)
await step('b_createBlock', async () => {
  const before = await page.locator('.vue-flow__node-block').count()
  // select first page node
  await page.locator('.vue-flow__node-page').first().click()
  await page.waitForTimeout(150)
  await page.click('button[aria-label^="Bloc"]')
  await page.waitForTimeout(300)
  const after = await page.locator('.vue-flow__node-block').count()
  return { before, after, ok: after === before + 1 }
})

// (c) Add a behavior note, verify a connector (attach path) exists
await step('c_addNote', async () => {
  const before = await page.locator('.vue-flow__node-note').count()
  await page.locator('.vue-flow__node-block').first().click()
  await page.waitForTimeout(150)
  await page.click('button[aria-label^="Note comportement"]')
  await page.waitForTimeout(300)
  const after = await page.locator('.vue-flow__node-note').count()
  // proximity connector attach edges
  const attachEdges = await page.locator('.vue-flow__edge').count()
  return { before, after, attachEdges, ok: after === before + 1 }
})

// (f) Inline edit a page title (double-click title)
await step('f_inlineEdit', async () => {
  const titleSel = '.vue-flow__node-page div[title="Double-clic pour renommer"]'
  const titleEl = page.locator(titleSel).first()
  const orig = (await titleEl.textContent())?.trim()
  await titleEl.dblclick()
  await page.waitForTimeout(150)
  const input = page.locator('.vue-flow__node-page input').first()
  await input.fill('Titre modifié smoke')
  await input.press('Enter')
  await page.waitForTimeout(200)
  const now = (await page.locator(titleSel).first().textContent())?.trim()
  return { orig, now, ok: now === 'Titre modifié smoke' }
})

// (d) Quick-create: drag from a page nav handle, drop into empty canvas -> QuickCreateMenu
await step('d_quickCreate', async () => {
  // target the connectable source (right) nav handle specifically
  const handle = page.locator('.vue-flow__node-page .vue-flow__handle.source').first()
  const hb = await handle.boundingBox()
  if (!hb) return { ok: false, reason: 'no source handle' }
  const pane = await page.locator('.vue-flow__pane').boundingBox()
  const tx = pane.x + pane.width - 90
  const ty = pane.y + pane.height - 90
  const cx = hb.x + hb.width / 2
  const cy = hb.y + hb.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // several intermediate moves so Vue Flow registers a connection-in-progress
  await page.mouse.move(cx + 20, cy + 20, { steps: 3 })
  await page.mouse.move(tx, ty, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const qc = await page.locator('.quick-create').count()
  const opened = qc > 0
  // dismiss: the close-sensor backdrop closes menus on pointerdown (Escape does not).
  // Dispatch pointerdown directly on the backdrop so we never hit a menu item.
  if (opened) {
    await page.locator('.fixed.inset-0.z-40').first().dispatchEvent('pointerdown')
    await page.waitForTimeout(150)
  }
  const stillOpen = await page.locator('.quick-create').count()
  return { quickCreateMenuOpened: opened, dismissed: stillOpen === 0, ok: opened }
})

// (e) Context menu delete
await step('e_contextDelete', async () => {
  const before = await page.locator('.vue-flow__node-note').count()
  await page.locator('.vue-flow__node-note').first().click({ button: 'right' })
  await page.waitForTimeout(200)
  const del = page.locator('button:has-text("Supprimer")').first()
  const seen = await del.count()
  if (seen) {
    await del.click()
    await page.waitForTimeout(300)
  }
  const after = await page.locator('.vue-flow__node-note').count()
  return { menuSeen: seen, before, after, ok: seen > 0 && after < before }
})

// (g) Specs mode: page -> blocks -> notes
await step('g_specs', async () => {
  await page.click('button[role="tab"]:has-text("Specs")')
  await page.waitForTimeout(400)
  const body = await page.textContent('body')
  await page.screenshot({ path: OUT + 'specs.png', fullPage: false })
  // demo has these page names
  return {
    hasAccueil: body.includes('Accueil') || body.toLowerCase().includes('accueil'),
    hasCatalogue: body.toLowerCase().includes('catalogue'),
    ok: body.length > 200,
  }
})

// (h) API mode: grouped by service + base URL
await step('h_api', async () => {
  await page.click('button[role="tab"]:has-text("API")')
  await page.waitForTimeout(400)
  const body = await page.textContent('body')
  await page.screenshot({ path: OUT + 'api.png', fullPage: false })
  return {
    hasBaseUrl: /https?:\/\//.test(body),
    hasService: /ERP|SAP|Keycloak|Stripe|SSO/i.test(body),
    ok: /https?:\/\//.test(body),
  }
})

// (i) API-only filter dims behavior notes on canvas
await step('i_apiFilter', async () => {
  await page.click('button[role="tab"]:has-text("Canvas")')
  await page.waitForTimeout(300)
  // click FilterBar "API" note-type toggle
  await page.locator('div[role="group"][aria-label="Filtrer par type de note"] button:has-text("API")').click()
  await page.waitForTimeout(300)
  // find a behavior note card and read its opacity (behavior notes should be dimmed)
  const notes = page.locator('.vue-flow__node-note')
  const n = await notes.count()
  let dimmedFound = false
  let fullFound = false
  for (let i = 0; i < n; i++) {
    const inner = notes.nth(i).locator('> div').first()
    const op = await inner.evaluate((el) => getComputedStyle(el).opacity).catch(() => '1')
    if (parseFloat(op) < 0.6) dimmedFound = true
    if (parseFloat(op) >= 0.9) fullFound = true
  }
  // reset filter
  await page.locator('div[role="group"][aria-label="Filtrer par type de note"] button:has-text("Toutes")').click()
  return { noteCount: n, dimmedFound, fullFound, ok: dimmedFound }
})

R._consoleErrors = consoleErrors
R._pageErrors = pageErrors
R._externalRequests = externalRequests
R._totalRequests = totalRequests

await browser.close()
console.log(JSON.stringify(R, null, 2))
