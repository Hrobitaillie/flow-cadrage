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
await p.mouse.click(pb.x+680, pb.y+560); await p.waitForTimeout(200)
await p.keyboard.press('v'); await p.waitForTimeout(200)
const N=i=>p.locator('.vue-flow__node-feature').nth(i)
// drag from A's bottom CENTER free port; drop at various spots
async function dragFromCenter(si, tx, ty){
  const s=N(si); const sb=await s.boundingBox()
  await s.hover(); await p.waitForTimeout(180)
  await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height-2); await p.mouse.down()
  await p.mouse.move(tx, ty, {steps:18}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(400)
}
R.e0=await p.locator('.vue-flow__edge').count()
// A->B drop on B CENTER
{ const bb=await N(1).boundingBox(); await dragFromCenter(0, bb.x+bb.width/2, bb.y+bb.height/2) }
R.e1=await p.locator('.vue-flow__edge').count()
// A->C drop on C's CORNER (top-left) — far from center
{ const cb=await N(2).boundingBox(); await dragFromCenter(0, cb.x+12, cb.y+12) }
R.e2=await p.locator('.vue-flow__edge').count()
R.errs=errs
console.log('ROBUST '+JSON.stringify(R))
await b.close()
