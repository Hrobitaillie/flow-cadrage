import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
await p.keyboard.press('m'); await p.mouse.click(360,220); await p.waitForTimeout(300)
const mod=p.locator('.vue-flow__node-module').first(); let mb=await mod.boundingBox()
await mod.click({position:{x:40,y:8}}); await p.waitForTimeout(120)
await p.mouse.move(mb.x+mb.width-6, mb.y+mb.height-6); await p.mouse.down(); await p.mouse.move(mb.x+mb.width+360, mb.y+mb.height+280,{steps:20}); await p.mouse.up(); await p.waitForTimeout(400)
mb=await mod.boundingBox()
await p.mouse.dblclick(mb.x+470, mb.y+70); await p.waitForTimeout(300)
await p.mouse.dblclick(mb.x+470, mb.y+130); await p.waitForTimeout(300)
const f=p.locator('.vue-flow__node-feature'); R.feats=await f.count()
const f0=await f.nth(0).boundingBox(), f1=await f.nth(1).boundingBox()
// f0 top, f1 below (stacked x=0). Drag f0; cursor just BELOW f1 → ghost at below-slot of f1
await p.mouse.move(f0.x+f0.width/2, f0.y+f0.height/2); await p.mouse.down()
await p.mouse.move(f1.x+f1.width/2, f1.y+f1.height+22, {steps:20}); await p.waitForTimeout(250)
R.ghostMid = await p.locator('.drag-ghost rect').count()
const g = await p.locator('.drag-ghost rect').first().evaluate(el=>({y:+el.getAttribute('y'),h:+el.getAttribute('height')})).catch(()=>null)
R.ghostBelowF1 = g ? (g.y > f1.y+f1.height-15) : false
await p.screenshot({path:new URL('./below.png',import.meta.url).pathname, clip:{x:Math.max(0,mb.x-30),y:Math.max(0,mb.y-30),width:820,height:520}})
await p.mouse.up(); await p.waitForTimeout(300)
R.errs=errs.slice(0,3)
console.log('BELOW '+JSON.stringify(R))
await b.close()
