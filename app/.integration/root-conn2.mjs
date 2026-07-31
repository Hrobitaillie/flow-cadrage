import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
const R={}
try{
  await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
  await p.waitForSelector('.app-shell')
  await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(300)
  const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
  await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
  await p.mouse.click(pb.x+300, pb.y+250); await p.waitForTimeout(200) // A (left area, away from editor)
  await p.mouse.click(pb.x+300, pb.y+520); await p.waitForTimeout(200) // B below A
  await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  R.feats=await p.locator('.vue-flow__node-feature').count()
  const A=p.locator('.vue-flow__node-feature').nth(0), B=p.locator('.vue-flow__node-feature').nth(1)
  const ab=await A.boundingBox(), bb=await B.boundingBox()
  R.A={x:Math.round(ab.x),y:Math.round(ab.y),w:Math.round(ab.width),h:Math.round(ab.height)}
  R.B={x:Math.round(bb.x),y:Math.round(bb.y)}
  await A.hover(); await p.waitForTimeout(150)
  R.e0=await p.locator('.vue-flow__edge').count()
  // drag from A bottom-center (free source port) to B center
  await p.mouse.move(ab.x+ab.width/2, ab.y+ab.height-1); await p.mouse.down()
  await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2, {steps:18}); await p.waitForTimeout(150); await p.mouse.up()
  await p.waitForTimeout(400)
  R.e1=await p.locator('.vue-flow__edge').count()
  R.quick=await p.locator('.quick-create').count()
  // second link B->A (different direction)
  await B.hover(); await p.waitForTimeout(150)
  await p.mouse.move(bb.x+bb.width/2, bb.y+1); await p.mouse.down()
  await p.mouse.move(ab.x+ab.width/2, ab.y+ab.height/2, {steps:18}); await p.waitForTimeout(150); await p.mouse.up()
  await p.waitForTimeout(400)
  R.e2=await p.locator('.vue-flow__edge').count()
}catch(e){R.error=String(e)}
R.errs=errs
console.log('ROOT2 '+JSON.stringify(R))
await b.close()
