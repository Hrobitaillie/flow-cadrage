import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]')
await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")')
await p.waitForTimeout(900)
const R={}
R.before = await p.locator('.vue-flow__edge').count()
// connect SOC-13 (bottom of module 00) -> SOC-11 (just above) : adjacent-ish, easy to see
const src = p.locator('.vue-flow__node-feature:has-text("SOC-13")').first()
const tgt = p.locator('.vue-flow__node-feature:has-text("SOC-11")').first()
await src.hover(); await p.waitForTimeout(150)
const h = src.locator('.vue-flow__handle-top.source').last()
const hb = await h.boundingBox(); const tb = await tgt.boundingBox()
await p.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await p.mouse.down()
await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:12}); await p.waitForTimeout(120); await p.mouse.up()
await p.waitForTimeout(500)
R.after = await p.locator('.vue-flow__edge').count()
R.errs = errs
// screenshot the module 00 column region
const col = await src.boundingBox()
await p.screenshot({ path: new URL('./drag-visual.png', import.meta.url).pathname, clip: { x: Math.max(col.x-30,0), y: 60, width: 340, height: 860 } })
console.log(JSON.stringify(R,null,2))
await b.close()
