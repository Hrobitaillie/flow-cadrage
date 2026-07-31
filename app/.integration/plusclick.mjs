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
const node = p.locator('.vue-flow__node-feature').first()
// hover BOTTOM half to get bottom button: hover then move within to bottom
await node.hover()
const c = await node.boundingBox()
await p.mouse.move(c.x+c.width/2, c.y+c.height*0.85, {steps:4}); await p.waitForTimeout(150)
R.plusCount = await p.locator('.add-adjacent').count()
await p.locator('.add-adjacent').first().click({timeout:5000}).catch(e=>R.clickErr=String(e).slice(0,50))
await p.waitForTimeout(500)
R.feats1 = await p.locator('.vue-flow__node-feature').count()
R.created = R.feats1 === R.feats0+1
const bxs=[]; const f=p.locator('.vue-flow__node-feature')
for(let i=0;i<await f.count();i++) bxs.push(await f.nth(i).boundingBox())
bxs.sort((a,b)=>a.y-b.y)
R.tightGap = bxs.length>=2 ? Math.round(bxs[1].y-(bxs[0].y+bxs[0].height)) : null
R.errs=errs.slice(0,2)
console.log('PLUSCLICK '+JSON.stringify(R))
await b.close()
