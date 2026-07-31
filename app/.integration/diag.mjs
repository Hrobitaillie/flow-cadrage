import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1500, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
p.on('dialog', d=>d.accept())
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]')
await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")')
await p.waitForTimeout(900)
const R={}
const edges = ()=>p.locator('.vue-flow__edge').count()
const feats = ()=>p.locator('.vue-flow__node-feature').count()

async function connect(srcText, tgtText, handleSel){
  const src=p.locator(`.vue-flow__node-feature:has-text("${srcText}")`).first()
  const tgt=p.locator(`.vue-flow__node-feature:has-text("${tgtText}")`).first()
  await src.hover(); await p.waitForTimeout(120)
  const h=src.locator(handleSel).last()
  const hb=await h.boundingBox(); const tb=await tgt.boundingBox()
  if(!hb||!tb) return false
  await p.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2); await p.mouse.down()
  await p.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2,{steps:12}); await p.waitForTimeout(100); await p.mouse.up()
  await p.waitForTimeout(400); return true
}

// multi outgoing from CAT-05 (has no deps, nothing depends on it -> clean)
R.e0 = await edges()
await connect('CAT-05','CAT-06','.vue-flow__handle-bottom.source')
R.e1 = await edges()
await connect('CAT-05','CAT-07','.vue-flow__handle-bottom.source')
R.e2 = await edges()
await connect('CAT-05','CAT-08','.vue-flow__handle-bottom.source')
R.e3 = await edges()

// Delete: click a feature then press Delete
R.featBefore = await feats()
await p.locator('.vue-flow__node-feature:has-text("CAT-17")').first().click()
await p.waitForTimeout(200)
await p.keyboard.press('Delete')
await p.waitForTimeout(300)
R.featAfterDelete = await feats()

R.errs = errs
console.log(JSON.stringify(R,null,2))
await b.close()
