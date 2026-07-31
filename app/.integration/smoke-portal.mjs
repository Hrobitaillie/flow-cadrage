import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE || 'http://localhost:5219/'
const consoleErrors = []
const pageErrors = []

const browser = await chromium.launch()
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then((c) => c.newPage())
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('dialog', (d) => d.accept())

const R = {}
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.app-shell', { timeout: 10000 })

// Charger le cadrage locasyst (passe en couche fonctionnelle)
await page.click('button[aria-label="Menu fichier"]')
await page.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")')
await page.waitForTimeout(800)

// Mode par défaut = arrière-plan : des lignes, pas de pastilles portail
R.edgesBackground = await page.locator('.vue-flow__edge').count()
R.portalsBackground = await page.locator('.vue-flow__node-portal').count()
await page.screenshot({ path: new URL('./func-background.png', import.meta.url).pathname })

// Bascule → Portails : des pastilles apparaissent, les longues lignes disparaissent
await page.click('button:has-text("Portails")')
await page.waitForTimeout(500)
R.portalsPortalMode = await page.locator('.vue-flow__node-portal').count()
R.edgesPortalMode = await page.locator('.vue-flow__edge').count()
await page.screenshot({ path: new URL('./func-portal.png', import.meta.url).pathname })

// Retour arrière-plan : plus de pastilles
await page.click('button:has-text("Arrière-plan")')
await page.waitForTimeout(400)
R.portalsAfterBack = await page.locator('.vue-flow__node-portal').count()

R.consoleErrors = consoleErrors
R.pageErrors = pageErrors
R.ok =
  R.edgesBackground > 40 &&
  R.portalsBackground === 0 &&
  R.portalsPortalMode > 0 &&
  R.edgesPortalMode < R.edgesBackground && // les liens inter-modules ne sont plus des lignes
  R.portalsAfterBack === 0 &&
  consoleErrors.length === 0 &&
  pageErrors.length === 0

console.log(JSON.stringify(R, null, 2))
await browser.close()
process.exit(R.ok ? 0 : 1)
