import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
const R={}
try {
  await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
  await p.waitForSelector('.app-shell')
  await p.click('button[role="tab"]:has-text("Fonctionnalités")')
  await p.waitForTimeout(300)
  const pane = await p.$('.vue-flow__pane'); const pb = await pane.boundingBox()
  await p.click('button[aria-label^="Fonctionnalité"]', { modifiers:['Shift'] })
  await p.mouse.click(pb.x+380, pb.y+250); await p.waitForTimeout(200)
  await p.mouse.click(pb.x+760, pb.y+250); await p.waitForTimeout(200)
  await p.mouse.click(pb.x+570, pb.y+520); await p.waitForTimeout(200)
  await p.keyboard.press('v'); await p.waitForTimeout(200)
  R.feats = await p.locator('.vue-flow__node-feature').count()
  async function conn(srcIdx, tgtIdx){
    const nodes = p.locator('.vue-flow__node-feature')
    const src = nodes.nth(srcIdx), tgt = nodes.nth(tgtIdx)
    await src.hover(); await p.waitForTimeout(150)
    const h = src.locator('.vue-flow__handle-bottom').last()
    const hb = await h.boundingBox().catch(()=>null); const tb = await tgt.boundingBox().catch(()=>null)
    if(!hb||!tb) return 'nobox'
    await p.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await p.mouse.down()
    await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:14}); await p.waitForTimeout(120); await p.mouse.up()
    await p.waitForTimeout(400); return 'ok'
  }
  R.e0 = await p.locator('.vue-flow__edge').count()
  R.c1 = await conn(0,2); R.e1 = await p.locator('.vue-flow__edge').count()
  R.c2 = await conn(1,2); R.e2 = await p.locator('.vue-flow__edge').count()
  await p.screenshot({ path: new URL('./abc.png', import.meta.url).pathname, clip:{ x: pb.x+280, y: pb.y+180, width: 640, height: 480 } })
} catch(e){ R.error = String(e) }
R.errs = errs
console.log('ABC '+JSON.stringify(R))
await b.close()
