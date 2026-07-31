import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(600)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+500, pb.y+250); await p.waitForTimeout(200)
await p.mouse.click(pb.x+340, pb.y+560); await p.waitForTimeout(200)
await p.mouse.click(pb.x+660, pb.y+560); await p.waitForTimeout(200)
await p.keyboard.press('v'); await p.waitForTimeout(200)
const N=i=>p.locator('.vue-flow__node-feature').nth(i)
async function connFromHandle(si, ti, pickLast){
  const s=N(si),t=N(ti)
  await s.hover(); await p.waitForTimeout(200)
  // free source handle on bottom = the .dep-free that is a source at bottom
  const handles = s.locator('.vue-flow__handle-bottom.source')
  const cnt = await handles.count()
  const h = pickLast ? handles.nth(cnt-1) : handles.first()
  const hb = await h.boundingBox().catch(()=>null); const tb=await t.boundingBox()
  if(!hb) return {cnt, hb:null}
  await p.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await p.mouse.down()
  await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:18}); await p.waitForTimeout(150); await p.mouse.up()
  await p.waitForTimeout(400)
  return {cnt}
}
R.e0=await p.locator('.vue-flow__edge').count()
R.c1=await connFromHandle(0,1,true); R.e1=await p.locator('.vue-flow__edge').count()
R.srcHandlesAfter1 = await N(0).locator('.vue-flow__handle-bottom.source').count()
R.c2=await connFromHandle(0,2,true); R.e2=await p.locator('.vue-flow__edge').count()
R.errs=errs
console.log('SECOND '+JSON.stringify(R))
await b.close()
