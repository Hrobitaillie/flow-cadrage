import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
try{
  await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
  await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(500)
  const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
  await p.click('button[aria-label^="Module"]', {modifiers:['Shift']})
  await p.mouse.click(pb.x+400, pb.y+250); await p.waitForTimeout(300)
  await p.mouse.click(pb.x+700, pb.y+560); await p.waitForTimeout(300)  // B well to the right
  await p.keyboard.press('v'); await p.waitForTimeout(200)
  const A=p.locator('.vue-flow__node-module').nth(0), B=p.locator('.vue-flow__node-module').nth(1)
  const A0=await A.boundingBox(), B0=await B.boundingBox()
  R.beforeDX=Math.round(B0.x-A0.x)
  // grab B header, move its LEFT edge to A.x+3
  await p.mouse.move(B0.x+40, B0.y+15); await p.mouse.down()
  const targetScreenX = A0.x + 3   // want B.left at A.left+3
  await p.mouse.move(targetScreenX+40, B0.y+15, {steps:25}); await p.waitForTimeout(200)
  R.guides = await p.locator('.snap-guides line').count()
  const Bmid=await B.boundingBox()
  R.dxMidDrag = Math.round(Bmid.x - A0.x)
  await p.mouse.up(); await p.waitForTimeout(400)
  const A1=await A.boundingBox(), B1=await B.boundingBox()
  R.afterDX=Math.round(B1.x-A1.x)
}catch(e){R.error=String(e)}
R.errs=errs
console.log('SNAP2 '+JSON.stringify(R))
await b.close()
