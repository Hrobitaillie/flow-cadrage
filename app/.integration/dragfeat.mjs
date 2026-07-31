import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor:2 }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(900)
R.feats=await p.locator('.vue-flow__node-feature').count()
R.modules=await p.locator('.vue-flow__node-module').count()
// drag first feature of module 0 to the RIGHT (free position, side by side)
const f0 = p.locator('.vue-flow__node-feature').nth(1) // nth(0) may be a header-adjacent; take 1
const b0 = await f0.boundingBox()
R.f0before = {x:Math.round(b0.x), y:Math.round(b0.y)}
await f0.hover(); await p.waitForTimeout(150)
// grab card body (avoid handles at edges) — center
await p.mouse.move(b0.x+b0.width/2, b0.y+b0.height/2); await p.mouse.down()
await p.mouse.move(b0.x+b0.width/2+120, b0.y+b0.height/2+40, {steps:15}); await p.waitForTimeout(150); await p.mouse.up()
await p.waitForTimeout(600)
const b1 = await f0.boundingBox()
R.f0after = {x:Math.round(b1.x), y:Math.round(b1.y)}
R.moved = Math.abs(b1.x-b0.x) > 50
R.errs=errs.slice(0,3)
await p.screenshot({ path: new URL('./dragfeat.png', import.meta.url).pathname, clip:{x:150,y:100,width:900,height:800} })
console.log('DRAGFEAT '+JSON.stringify(R))
await b.close()
