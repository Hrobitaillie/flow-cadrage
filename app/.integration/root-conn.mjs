import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1500, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
const R={}
try{
  await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
  await p.waitForSelector('.app-shell')
  await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(300)
  const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
  await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
  await p.mouse.click(pb.x+350, pb.y+250); await p.waitForTimeout(200) // A
  await p.mouse.click(pb.x+350, pb.y+500); await p.waitForTimeout(200) // B directly below A
  await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  R.feats=await p.locator('.vue-flow__node-feature').count()
  R.editorOpen = await p.locator('aside[aria-label="Éditeur de fonctionnalité"]').count()
  const A=p.locator('.vue-flow__node-feature').nth(0), B=p.locator('.vue-flow__node-feature').nth(1)
  await A.hover(); await p.waitForTimeout(150)
  const h=A.locator('.vue-flow__handle-bottom').last()
  const hb=await h.boundingBox(); const bb=await B.boundingBox()
  R.hb=hb?{x:Math.round(hb.x),y:Math.round(hb.y)}:null
  R.e0=await p.locator('.vue-flow__edge').count()
  await p.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await p.mouse.down()
  await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2, {steps:16}); await p.waitForTimeout(150); await p.mouse.up()
  await p.waitForTimeout(400)
  R.e1=await p.locator('.vue-flow__edge').count()
  R.quick=await p.locator('.quick-create').count()
}catch(e){R.error=String(e)}
R.errs=errs
console.log('ROOT '+JSON.stringify(R))
await b.close()
