import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport:{width:1700,height:1000}, deviceScaleFactor:1 }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(900)
const mod0 = p.locator('.vue-flow__node-module').first()
const mb = await mod0.boundingBox(); R.modH_before=Math.round(mb.height); R.modX=Math.round(mb.x)
// leftmost-column features = those whose x within ~30px of module0 content
const feats = p.locator('.vue-flow__node-feature')
const n = await feats.count(); const boxes=[]
for (let i=0;i<n;i++){ const bx=await feats.nth(i).boundingBox(); if(bx && Math.abs(bx.x-(mb.x+11))<20) boxes.push({i,x:bx.x,y:bx.y,w:bx.width,h:bx.height}) }
boxes.sort((a,b)=>a.y-b.y); const bottom=boxes[boxes.length-1]; R.colCount=boxes.length; R.bottomY=Math.round(bottom.y)
// drag bottom card DOWN by ~40px screen, keep x same (stay in column → no reparent)
const sx=bottom.x+bottom.w/2, sy=bottom.y+bottom.h/2
await p.mouse.move(sx,sy); await p.mouse.down(); await p.mouse.move(sx, sy+45, {steps:15}); await p.waitForTimeout(200)
const mbMid=await mod0.boundingBox(); R.modH_mid=Math.round(mbMid.height)
await p.mouse.up(); await p.waitForTimeout(500)
const mbAf=await mod0.boundingBox(); R.modH_after=Math.round(mbAf.height)
R.grewMid = R.modH_mid > R.modH_before+10; R.grewAfter = R.modH_after > R.modH_before+10
R.errs=errs.slice(0,3)
console.log('VGROW '+JSON.stringify(R))
await b.close()
