import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE || 'http://localhost:5219/'
const consoleErrors = []
const pageErrors = []

const browser = await chromium.launch()
const page = await browser.newContext({ viewport: { width: 1400, height: 900 } }).then((c) => c.newPage())
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('dialog', (d) => d.accept())

const R = {}
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.app-shell', { timeout: 10000 })

// 1) Charger le cadrage locasyst via le menu fichier
await page.click('button[aria-label="Menu fichier"]')
await page.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")')
await page.waitForTimeout(700)
R.modules = await page.locator('.vue-flow__node-module').count()
R.features = await page.locator('.vue-flow__node-feature').count()
R.depEdges = await page.locator('.vue-flow__edge').count()

// Containment : la 1re fonctionnalité (SOC-01) doit être géométriquement DANS le 1er module (00).
const modBox = await page.locator('.vue-flow__node-module').first().boundingBox()
const featBox = await page.locator('.vue-flow__node-feature').first().boundingBox()
R.featureInsideModule =
  !!modBox &&
  !!featBox &&
  featBox.x >= modBox.x - 2 &&
  featBox.x + featBox.width <= modBox.x + modBox.width + 2 &&
  featBox.y >= modBox.y - 2 &&
  featBox.y + featBox.height <= modBox.y + modBox.height + 2

// 2) Largeur du canvas AVANT ouverture du split
const mainBefore = await page.locator('main').evaluate((el) => el.getBoundingClientRect().width)

// 3) Clic sur une fonctionnalité → le split doit s'ouvrir
await page.locator('.vue-flow__node-feature').first().click()
await page.waitForTimeout(500)
R.editorVisible = await page.locator('aside[aria-label="Éditeur de fonctionnalité"]').count()
const mainAfter = await page.locator('main').evaluate((el) => el.getBoundingClientRect().width)
R.canvasShrank = mainAfter < mainBefore - 100

// 4) Éditer le titre (champ invisibilisé) : taper puis blur
const title = page.locator('aside[aria-label="Éditeur de fonctionnalité"] input').first()
await title.click()
await title.fill('Fonctionnalité éditée (smoke)')
await page.keyboard.press('Tab')
await page.waitForTimeout(400)
await page.screenshot({ path: new URL('./editor.png', import.meta.url).pathname })

// 5) Fermer le split
await page.click('aside[aria-label="Éditeur de fonctionnalité"] button[aria-label="Fermer l\'éditeur"]')
await page.waitForTimeout(400)
R.editorClosed = (await page.locator('aside[aria-label="Éditeur de fonctionnalité"]').count()) === 0
const mainClosed = await page.locator('main').evaluate((el) => el.getBoundingClientRect().width)
R.canvasRestored = mainClosed > mainAfter + 100

R.consoleErrors = consoleErrors
R.pageErrors = pageErrors
R.ok =
  R.modules === 9 &&
  R.features > 60 &&
  R.depEdges > 0 &&
  R.featureInsideModule &&
  R.editorVisible === 1 &&
  R.canvasShrank &&
  R.editorClosed &&
  R.canvasRestored &&
  consoleErrors.length === 0 &&
  pageErrors.length === 0

console.log(JSON.stringify(R, null, 2))
await browser.close()
process.exit(R.ok ? 0 : 1)
