import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
await p.keyboard.press('m'); await p.mouse.click(650,250); await p.waitForTimeout(300)
const mod=p.locator('.vue-flow__node-module').first(); let mb=await mod.boundingBox()
await mod.click({position:{x:40,y:8}}); await p.waitForTimeout(120)
await p.mouse.move(mb.x+mb.width-6, mb.y+mb.height-6); await p.mouse.down(); await p.mouse.move(mb.x+mb.width+40, mb.y+mb.height+160,{steps:15}); await p.mouse.up(); await p.waitForTimeout(400)
mb=await mod.boundingBox()
await p.mouse.dblclick(mb.x+140, mb.y+70); await p.waitForTimeout(300)
await p.mouse.dblclick(mb.x+140, mb.y+230); await p.waitForTimeout(300)
const f=p.locator('.vue-flow__node-feature'); R.feats=await f.count()
const bxs=[]; for(let i=0;i<await f.count();i++) bxs.push({i,...(await f.nth(i).boundingBox())})
bxs.sort((a,b)=>a.y-b.y); const f0=bxs[0],f1=bxs[1]
R.f0x_before=Math.round(f0.x); R.modLeft_before=Math.round(mb.x)
// grab f1, move cursor to the LEFT of f0
await p.mouse.move(f1.x+f1.width/2, f1.y+f1.height/2); await p.mouse.down()
await p.mouse.move(f0.x - 20 - f1.width/2, f0.y+f1.height/2, {steps:20}); await p.waitForTimeout(250)
R.ghostMid = await p.locator('.drag-ghost rect').count()
const g = await p.locator('.drag-ghost rect').first().evaluate(el=>({x:+el.getAttribute('x')})).catch(()=>null)
R.ghostLeftOfF0 = g ? (g.x < f0.x-10) : false
await p.mouse.up(); await p.waitForTimeout(500)
const f0a=await f.nth(f0.i).boundingBox(), f1a=await f.nth(f1.i).boundingBox()
const mba=await mod.boundingBox()
R.f0x_after=Math.round(f0a.x); R.f1x_after=Math.round(f1a.x); R.modLeft_after=Math.round(mba.x)
R.f1_left_of_f0 = f1a.x < f0a.x - 50
R.module_grew_left = mba.x < mb.x - 50
R.f0_stayed = Math.abs(f0a.x - f0.x) < 40
R.errs=errs.slice(0,3)
console.log('LEFT '+JSON.stringify(R))
await b.close()
