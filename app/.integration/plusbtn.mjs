import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1400,height:950},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
await p.keyboard.press('m'); await p.mouse.click(400,300); await p.waitForTimeout(300)
await p.mouse.dblclick(400+120, 300+70); await p.waitForTimeout(300)
R.feats0 = await p.locator('.vue-flow__node-feature').count()
const card = await p.locator('.vue-flow__node-feature').first().boundingBox()
// hover near BOTTOM edge → "+" should appear at bottom
await p.mouse.move(card.x+card.width/2, card.y+card.height-6); await p.waitForTimeout(150)
R.plusVisible = await p.locator('.add-adjacent').count()
// click the "+" button
await p.locator('.add-adjacent').first().click(); await p.waitForTimeout(500)
R.feats1 = await p.locator('.vue-flow__node-feature').count()
// new feature below the first?
const bxs=[]; const f=p.locator('.vue-flow__node-feature')
for(let i=0;i<await f.count();i++) bxs.push(await f.nth(i).boundingBox())
bxs.sort((a,b)=>a.y-b.y)
R.secondBelowFirst = bxs.length>=2 && bxs[1].y > bxs[0].y+bxs[0].height-10 && Math.abs(bxs[1].x-bxs[0].x)<10
R.created = R.feats1 === R.feats0+1
R.errs=errs.slice(0,3)
console.log('PLUSBTN '+JSON.stringify(R))
await b.close()
