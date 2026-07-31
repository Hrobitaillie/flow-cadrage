import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1500, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
const R={}
// switch to functional layer (empty project)
await p.click('button[role="tab"]:has-text("Fonctionnalités")')
await p.waitForTimeout(300)
const feats=()=>p.locator('.vue-flow__node-feature').count()
const mods=()=>p.locator('.vue-flow__node-module').count()
R.feat0=await feats(); R.mod0=await mods()
// click Module tool -> should NOT create
await p.click('button[aria-label^="Module"]')
await p.waitForTimeout(150)
R.modAfterTool=await mods()  // expect 0 (placement mode)
// click canvas -> place module there
const pane = await p.$('.vue-flow__pane')
const pb = await pane.boundingBox()
await p.mouse.click(pb.x+400, pb.y+300)
await p.waitForTimeout(300)
R.modAfterClick=await mods()  // expect 1
// click Fonctionnalité tool -> should NOT create
await p.click('button[aria-label^="Fonctionnalité"]')
await p.waitForTimeout(150)
R.featAfterTool=await feats() // expect 0
// click canvas inside module area to place feature
await p.mouse.click(pb.x+450, pb.y+340)
await p.waitForTimeout(300)
R.featAfterClick=await feats() // expect 1
R.errs=errs
console.log('TOOL '+JSON.stringify(R))
await b.close()
