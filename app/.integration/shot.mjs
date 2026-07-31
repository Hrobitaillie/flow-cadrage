import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
const p = ctx.pages().find(pg => pg.url().includes('localhost:5219')) || ctx.pages()[0]
await p.bringToFront()
await p.screenshot({ path: new URL('./canvas-now.png', import.meta.url).pathname })
console.log('shot ok, edges=', await p.locator('.vue-flow__edge').count(), 'feats=', await p.locator('.vue-flow__node-feature').count())
await browser.close().catch(()=>{})
