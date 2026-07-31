import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE || 'http://localhost:5219/'
const consoleErrors = []
const pageErrors = []

const browser = await chromium.launch()
const page = await browser.newContext().then((c) => c.newPage())
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('dialog', (d) => d.accept())

const R = {}
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.app-shell', { timeout: 10000 })

// 1) Bascule en couche Fonctionnalités
await page.click('button[role="tab"]:has-text("Fonctionnalités")')
await page.waitForTimeout(200)
R.moduleToolVisible = await page.locator('button[aria-label^="Module"]').count()
R.featureToolVisible = await page.locator('button[aria-label^="Fonctionnalité"]').count()
R.pageToolHidden = await page.locator('button[aria-label^="Page"]').count() // doit être 0

// 2) Ajoute un module puis une fonctionnalité (via le dock)
await page.click('button[aria-label^="Module"]')
await page.waitForTimeout(150)
await page.click('button[aria-label^="Fonctionnalité"]')
await page.waitForTimeout(250)
R.modules = await page.locator('.vue-flow__node-module').count()
R.features = await page.locator('.vue-flow__node-feature').count()
await page.screenshot({ path: new URL('./functional.png', import.meta.url).pathname })

// 3) Retour Arborescence : les nœuds fonctionnels sont masqués
await page.click('button[role="tab"]:has-text("Arborescence")')
await page.waitForTimeout(200)
R.modulesAfterSwitch = await page.locator('.vue-flow__node-module').count() // 0
R.featuresAfterSwitch = await page.locator('.vue-flow__node-feature').count() // 0

// 4) Structural toujours vivant : créer une page
await page.click('button[aria-label^="Page"]')
await page.waitForTimeout(200)
R.pages = await page.locator('.vue-flow__node-page').count()

R.consoleErrors = consoleErrors
R.pageErrors = pageErrors
R.ok =
  R.moduleToolVisible > 0 &&
  R.pageToolHidden === 0 &&
  R.modules === 1 &&
  R.features === 1 &&
  R.modulesAfterSwitch === 0 &&
  R.featuresAfterSwitch === 0 &&
  R.pages >= 1 &&
  consoleErrors.length === 0 &&
  pageErrors.length === 0

console.log(JSON.stringify(R, null, 2))
await browser.close()
process.exit(R.ok ? 0 : 1)
