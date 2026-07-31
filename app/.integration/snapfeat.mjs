import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport:{width:1700,height:1000}, deviceScaleFactor:1 }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(900)
// module 0 = first module node; its two first feature children
const mod0 = p.locator('.vue-flow__node-module').first()
const mb0 = await mod0.boundingBox(); R.modW_before = Math.round(mb0.width)
// feature 0 and feature 1 (children of module 0, leftmost column)
const f0 = p.locator('.vue-flow__node-feature').nth(0)
const f1 = p.locator('.vue-flow__node-feature').nth(1)
const a0 = await f0.boundingBox(); const a1 = await f1.boundingBox()
R.f0=[Math.round(a0.x),Math.round(a0.y)]; R.f1=[Math.round(a1.x),Math.round(a1.y)]
// drag f1 to the RIGHT of f0, roughly beside it (should snap left=right+gap, top=top)
const tx = a0.x + a0.width + 18 + a1.width/2  // target center x ~ beside f0
const ty = a0.y + a1.height/2 - 4            // near f0 top
await p.mouse.move(a1.x+a1.width/2, a1.y+a1.height/2); await p.mouse.down()
await p.mouse.move(tx, ty, {steps:20}); await p.waitForTimeout(200)
const mbMid = await mod0.boundingBox(); R.modW_mid = Math.round(mbMid.width) // live resize?
// read snap guides count mid-drag
R.guidesMid = await p.locator('.snap-guide, [data-snap-guide], .snap-guides line, svg.snap line').count()
await p.mouse.up(); await p.waitForTimeout(500)
const mbAf = await mod0.boundingBox(); R.modW_after = Math.round(mbAf.width)
const b1 = await f1.boundingBox(); R.f1_after=[Math.round(b1.x),Math.round(b1.y)]
R.grew = R.modW_after > R.modW_before + 100
R.errs = errs.slice(0,3)
await p.screenshot({ path:new URL('./snapfeat.png',import.meta.url).pathname, clip:{x:Math.max(0,mb0.x-40),y:Math.max(0,mb0.y-40),width:760,height:560} })
console.log('SNAPFEAT '+JSON.stringify(R))
await b.close()
