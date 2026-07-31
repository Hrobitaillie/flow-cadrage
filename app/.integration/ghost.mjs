import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:950},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
await p.keyboard.press('m'); await p.mouse.click(360,300); await p.waitForTimeout(300)
const mod=p.locator('.vue-flow__node-module').first(); let mb=await mod.boundingBox()
// widen module so there's room for a second card on the same row
await mod.click({position:{x:40,y:8}}); await p.waitForTimeout(120)
await p.mouse.move(mb.x+mb.width-6, mb.y+mb.height-6); await p.mouse.down(); await p.mouse.move(mb.x+mb.width+360, mb.y+mb.height+80,{steps:20}); await p.mouse.up(); await p.waitForTimeout(400)
mb=await mod.boundingBox()
// add 2 features
await p.mouse.dblclick(mb.x+80, mb.y+80); await p.waitForTimeout(300)
await p.mouse.dblclick(mb.x+470, mb.y+90); await p.waitForTimeout(300)
const f=p.locator('.vue-flow__node-feature'); R.feats=await f.count()
const f0=await f.nth(0).boundingBox(), f1=await f.nth(1).boundingBox()
// start dragging f1 towards the RIGHT of f0 (approach the beside slot) — hold, screenshot mid-drag
await p.mouse.move(f1.x+f1.width/2, f1.y+f1.height/2); await p.mouse.down()
await p.mouse.move(f0.x+f0.width+18+f1.width/2, f0.y+f1.height/2, {steps:20}); await p.waitForTimeout(250)
R.ghostVisibleMid = await p.locator('.drag-ghost rect').count()
await p.screenshot({path:new URL('./ghost-mid.png',import.meta.url).pathname, clip:{x:Math.max(0,mb.x-30),y:Math.max(0,mb.y-30),width:820,height:400}})
await p.mouse.up(); await p.waitForTimeout(400)
R.ghostAfter = await p.locator('.drag-ghost rect').count()
const f1a=await f.nth(1).boundingBox()
R.beside = f1a.x > f0.x+f0.width-20 && Math.abs(f1a.y-f0.y)<30
R.errs=errs.slice(0,3)
console.log('GHOST '+JSON.stringify(R))
await b.close()
