import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(600)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
// place A top-center, B bottom-left, C bottom-right
await p.mouse.click(pb.x+500, pb.y+250); await p.waitForTimeout(200) // A
await p.mouse.click(pb.x+340, pb.y+560); await p.waitForTimeout(200) // B
await p.mouse.click(pb.x+660, pb.y+560); await p.waitForTimeout(200) // C
R.toolStillActive = await p.evaluate(()=>document.querySelector('button[aria-label^="Fonctionnalité"]')?.getAttribute('aria-pressed'))
await p.keyboard.press('v'); await p.waitForTimeout(200)
R.feats=await p.locator('.vue-flow__node-feature').count()
const N=i=>p.locator('.vue-flow__node-feature').nth(i)
async function conn(si,ti){
  const s=N(si),t=N(ti); const sb=await s.boundingBox(), tb=await t.boundingBox()
  await s.hover(); await p.waitForTimeout(150)
  await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height-3); await p.mouse.down()
  await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:18}); await p.waitForTimeout(150); await p.mouse.up()
  await p.waitForTimeout(400)
}
R.e0=await p.locator('.vue-flow__edge').count()
await conn(0,1); R.e1=await p.locator('.vue-flow__edge').count() // A->B
await conn(0,2); R.e2=await p.locator('.vue-flow__edge').count() // A->C (2nd outgoing from A)
// delete a link: click the first edge then Delete
await p.locator('.vue-flow__edge').first().click({force:true}); await p.waitForTimeout(200)
await p.keyboard.press('Delete'); await p.waitForTimeout(300)
R.eAfterDel=await p.locator('.vue-flow__edge').count()
R.errs=errs
await p.screenshot({ path: new URL('./multi.png', import.meta.url).pathname, clip:{x:pb.x+200,y:pb.y+150,width:640,height:560} })
console.log('MULTI '+JSON.stringify(R))
await b.close()
