import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
try{
  await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
  await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(500)
  const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
  // place module A then module B (sticky module tool)
  await p.click('button[aria-label^="Module"]', {modifiers:['Shift']})
  await p.mouse.click(pb.x+400, pb.y+250); await p.waitForTimeout(300)  // A
  await p.mouse.click(pb.x+430, pb.y+560); await p.waitForTimeout(300)  // B (30px right of A)
  await p.keyboard.press('v'); await p.waitForTimeout(200)
  R.modules=await p.locator('.vue-flow__node-module').count()
  const A=p.locator('.vue-flow__node-module').nth(0), B=p.locator('.vue-flow__node-module').nth(1)
  const A0=await A.boundingBox(), B0=await B.boundingBox()
  R.beforeDX = Math.round(B0.x - A0.x)
  // drag B so its left edge is ~6px from A's left edge (within snap threshold 8)
  await p.mouse.move(B0.x+40, B0.y+15); await p.mouse.down()
  // move B left so its x ~ A.x + 6
  const dx = (A0.x + 6) - B0.x
  await p.mouse.move(B0.x+40+dx, B0.y+15, {steps:20}); await p.waitForTimeout(150)
  R.guidesDuringDrag = await p.locator('.snap-guides line').count()
  await p.mouse.up(); await p.waitForTimeout(400)
  const A1=await A.boundingBox(), B1=await B.boundingBox()
  R.afterDX = Math.round(B1.x - A1.x)  // should be ~0 if snapped to same X
}catch(e){R.error=String(e)}
R.errs=errs
console.log('SNAP '+JSON.stringify(R))
await b.close()
