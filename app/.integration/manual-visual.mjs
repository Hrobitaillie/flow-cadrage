import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1500, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(700)
const zoom = await p.evaluate(()=>{const e=document.querySelector('.vue-flow__transformationpane');const m=e&&getComputedStyle(e).transform;return m})
R.zoom=zoom
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+350, pb.y+300); await p.waitForTimeout(250) // A
await p.mouse.click(pb.x+350, pb.y+560); await p.waitForTimeout(250) // B below
await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
R.feats=await p.locator('.vue-flow__node-feature').count()
R.e0=await p.locator('.vue-flow__edge').count()
// connect A -> B: drag from A bottom edge to B
const A=p.locator('.vue-flow__node-feature').nth(0), B=p.locator('.vue-flow__node-feature').nth(1)
const ab=await A.boundingBox(), bb=await B.boundingBox()
R.Aw=Math.round(ab.width)
await A.hover(); await p.waitForTimeout(200)
await p.mouse.move(ab.x+ab.width/2, ab.y+ab.height-2); await p.mouse.down()
await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2, {steps:20}); await p.waitForTimeout(200); await p.mouse.up()
await p.waitForTimeout(500)
R.e1=await p.locator('.vue-flow__edge').count()
R.errs=errs
await p.screenshot({ path: new URL('./manual.png', import.meta.url).pathname, clip:{x:pb.x+150,y:pb.y+150,width:700,height:650} })
console.log('MANUAL '+JSON.stringify(R))
await b.close()
