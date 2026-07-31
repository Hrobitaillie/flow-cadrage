import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
p.on('dialog', d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(500)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+300, pb.y+300); await p.waitForTimeout(300)
await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
const n = p.locator('.vue-flow__node-feature').first()
const bb = await n.boundingBox()
R.node = bb ? {x:Math.round(bb.x),y:Math.round(bb.y),w:Math.round(bb.width),h:Math.round(bb.height)} : null
// also read the inner card
const card = n.locator('.feature-node').first()
const cb = await card.boundingBox().catch(()=>null)
R.card = cb ? {w:Math.round(cb.width),h:Math.round(cb.height)} : null
R.transformPane = await p.$eval('.vue-flow__viewport', el=>getComputedStyle(el).transform).catch(()=>'?')
console.log('MEAS '+JSON.stringify(R))
await b.close()
