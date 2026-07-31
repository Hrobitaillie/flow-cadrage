import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor:2 }).then(c=>c.newPage())
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
try{
  await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
  await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(600)
  const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
  await p.click('button[aria-label^="Module"]')
  await p.mouse.click(pb.x+500, pb.y+250); await p.waitForTimeout(300)
  R.modules=await p.locator('.vue-flow__node-module').count()
  const mb=await p.locator('.vue-flow__node-module').first().boundingBox()
  // double-click module HEADER (top strip) to add features
  for(let i=0;i<3;i++){ await p.mouse.dblclick(mb.x+mb.width/2, mb.y+18); await p.waitForTimeout(350) }
  R.feats=await p.locator('.vue-flow__node-feature').count()
  await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  const N=i=>p.locator('.vue-flow__node-feature').nth(i)
  async function conn(si,ti){
    const s=N(si),t=N(ti); const sb=await s.boundingBox(), tb=await t.boundingBox()
    if(!sb||!tb) return 'nobox'
    await s.hover(); await p.waitForTimeout(200)
    await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height-2); await p.mouse.down()
    await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:18}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(600); return 'ok'
  }
  R.e0=await p.locator('.vue-flow__edge').count()
  R.c1=await conn(0,1); R.e1=await p.locator('.vue-flow__edge').count()
  R.c2=await conn(0,2); R.e2=await p.locator('.vue-flow__edge').count()
  R.occ0=await N(0).locator('.dep-dot').count()
  await p.screenshot({ path: new URL('./modchild.png', import.meta.url).pathname, clip:{x:pb.x+350,y:pb.y+150,width:420,height:680} })
}catch(e){R.error=String(e)}
R.errs=errs
console.log('MODCHILD '+JSON.stringify(R))
await b.close()
