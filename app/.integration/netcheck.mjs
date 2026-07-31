import { chromium } from 'playwright'
const BASE = 'http://localhost:4173/'
const reqs = []
const errs = []
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('request', (r) => reqs.push(`${r.method()} ${r.url()}`))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERR ' + e))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('button[aria-label^="Page"]')
await page.click('button[aria-label^="Page"]')
await page.click('button[aria-label^="Section"]')
await page.click('button[aria-label^="Comportement"]')
await page.waitForTimeout(500)
const external = reqs.filter((u) => !u.includes('localhost:4173') && !u.startsWith('GET data:') && !u.startsWith('GET blob:'))
console.log(JSON.stringify({ totalRequests: reqs.length, external, consoleErrors: errs }, null, 2))
await browser.close()
