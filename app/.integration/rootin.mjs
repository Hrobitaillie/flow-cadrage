import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
// place a module on the left, and a ROOT feature on the right (outside module)
await p.keyboard.press('m'); await p.mouse.click(360,250); await p.waitForTimeout(300)
await p.mouse.dblclick(360+120, 250+70); await p.waitForTimeout(300) // one feature in module
await p.keyboard.press('f'); await p.mouse.click(950, 300); await p.waitForTimeout(300) // root feature far right
R.modCount=await p.locator('.vue-flow__node-module').count()
R.featCount=await p.locator('.vue-flow__node-feature').count()
const mod=await p.locator('.vue-flow__node-module').first().boundingBox()
// find the root feature = the one whose x is far from module (right side ~950)
const f=p.locator('.vue-flow__node-feature'); const bxs=[]
for(let i=0;i<await f.count();i++) bxs.push({i,...(await f.nth(i).boundingBox())})
const root = bxs.find(bx=>bx.x>700); R.rootFound=!!root
// drag root feature INTO the module (below the existing card)
const mMod=await p.locator('.vue-flow__node-module').first().boundingBox()
await p.mouse.move(root.x+root.width/2, root.y+root.height/2); await p.mouse.down()
await p.mouse.move(mMod.x+mMod.width/2, mMod.y+120, {steps:25}); await p.waitForTimeout(200)
R.ghostDuring=await p.locator('.drag-ghost rect').count()
await p.mouse.up(); await p.waitForTimeout(500)
// after: is the (formerly root) feature now inside the module bounds?
const mAfter=await p.locator('.vue-flow__node-module').first().boundingBox()
const bAfter=await f.nth(root.i).boundingBox()
R.featInsideModule = bAfter.x>=mAfter.x-5 && bAfter.x<=mAfter.x+mAfter.width && bAfter.y>=mAfter.y && bAfter.y<=mAfter.y+mAfter.height
R.errs=errs.slice(0,3)
console.log('ROOTIN '+JSON.stringify(R))
await b.close()
