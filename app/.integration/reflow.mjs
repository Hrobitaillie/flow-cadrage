import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:900},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
// place module A then B to its right
await p.keyboard.press('m'); await p.mouse.click(400,430); await p.waitForTimeout(300)
await p.keyboard.press('m'); await p.mouse.click(770,430); await p.waitForTimeout(300)
const mods=p.locator('.vue-flow__node-module'); R.count=await mods.count()
// identify A (left) and B (right) by x
const bx=[]; for(let i=0;i<await mods.count();i++){const r=await mods.nth(i).boundingBox(); bx.push({i,x:r.x,y:r.y,w:r.width,h:r.height})}
bx.sort((a,b)=>a.x-b.x); const A=bx[0], B=bx[1]
R.B_before=Math.round(B.x)
// select A, widen via grip until it overlaps B (A right edge must pass B.x)
await mods.nth(A.i).click({position:{x:40,y:8}}); await p.waitForTimeout(150)
const gx=A.x+A.w-6, gy=A.y+A.h-6
await p.mouse.move(gx,gy); await p.mouse.down(); await p.mouse.move(gx+260,gy+10,{steps:20}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(500)
const Bafter=await mods.nth(B.i).boundingBox(); const Aafter=await mods.nth(A.i).boundingBox()
R.A_w_after=Math.round(Aafter.width); R.B_after=Math.round(Bafter.x)
R.pushed = Bafter.x > B.x + 120
R.noOverlap = Bafter.x >= Aafter.x + Aafter.width - 2
R.errs=errs.slice(0,3)
console.log('REFLOW '+JSON.stringify(R))
await b.close()
