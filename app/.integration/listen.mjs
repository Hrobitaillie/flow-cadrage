import { chromium } from 'playwright'
import { appendFileSync } from 'node:fs'
const out = new URL('./listen.log', import.meta.url).pathname
const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
const p = ctx.pages().find(pg => pg.url().includes('localhost:5219')) || ctx.pages()[0]
appendFileSync(out, `\n=== SESSION ${new Date().toISOString()} url=${p.url()} ===\n`)
p.on('console', m => {
  const t = m.text()
  if (t.includes('[FLOOOW]')) appendFileSync(out, t + '\n')
})
p.on('pageerror', e => appendFileSync(out, 'PAGEERROR ' + String(e) + '\n'))
// keep alive ~120s
await new Promise(r => setTimeout(r, 120000))
await browser.close().catch(()=>{})
