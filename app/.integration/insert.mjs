import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
await p.keyboard.press('m'); await p.mouse.click(340,200); await p.waitForTimeout(300)
const mod=p.locator('.vue-flow__node-module').first(); let mb=await mod.boundingBox()
await mod.click({position:{x:40,y:8}}); await p.waitForTimeout(120)
await p.mouse.move(mb.x+mb.width-6, mb.y+mb.height-6); await p.mouse.down(); await p.mouse.move(mb.x+mb.width+380, mb.y+mb.height+360,{steps:20}); await p.mouse.up(); await p.waitForTimeout(400)
mb=await mod.boundingBox()
for(let i=0;i<3;i++){ await p.mouse.dblclick(mb.x+480, mb.y+70); await p.waitForTimeout(300) }
const f=p.locator('.vue-flow__node-feature'); R.feats=await f.count()
const bxs=[]; for(let i=0;i<await f.count();i++) bxs.push({i,...(await f.nth(i).boundingBox())})
bxs.sort((a,b)=>a.y-b.y); const f0=bxs[0],f1=bxs[1],f2=bxs[2]
R.f1y_before=Math.round(f1.y)
// grab f2 (bottom), move cursor to boundary between f0 and f1
await p.mouse.move(f2.x+f2.width/2, f2.y+f2.height/2); await p.mouse.down()
const boundary = (f0.y+f0.height + f1.y)/2
await p.mouse.move(f0.x+f0.width/2, boundary, {steps:20}); await p.waitForTimeout(250)
R.ghostMid = await p.locator('.drag-ghost rect').count()
const g = await p.locator('.drag-ghost rect').first().evaluate(el=>({y:+el.getAttribute('y')})).catch(()=>null)
R.ghostBetween = g ? (g.y > f0.y+f0.height-20 && g.y < f1.y+80) : false
// f1 shifted down live?
const f1now = await f.nth(f1.i).boundingBox()
R.f1_shifted_down = f1now.y > f1.y + 40
await p.screenshot({path:new URL('./insert.png',import.meta.url).pathname, clip:{x:Math.max(0,mb.x-30),y:Math.max(0,mb.y-30),width:820,height:640}})
await p.mouse.up(); await p.waitForTimeout(400)
R.errs=errs.slice(0,3)
console.log('INSERT '+JSON.stringify(R))
await b.close()
