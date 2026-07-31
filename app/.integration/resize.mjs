import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1400,height:900},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(400)
// new project to start empty
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){R.newProj=String(e).slice(0,40)}
// functional layer
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
// module tool + place
await p.keyboard.press('m'); await p.waitForTimeout(100)
await p.mouse.click(700, 480); await p.waitForTimeout(400)
let mod = p.locator('.vue-flow__node-module').first()
R.modCount = await p.locator('.vue-flow__node-module').count()
await mod.click({position:{x:60,y:8}}); await p.waitForTimeout(150) // select via header
const before = await mod.boundingBox(); R.before=[Math.round(before.width),Math.round(before.height)]
// grip at bottom-right
const gx = before.x+before.width-6, gy = before.y+before.height-6
await p.mouse.move(gx,gy); await p.mouse.down(); await p.mouse.move(gx+220, gy+120,{steps:20}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(400)
const after = await mod.boundingBox(); R.after=[Math.round(after.width),Math.round(after.height)]
R.wGrew = after.width>before.width+120; R.hGrew = after.height>before.height+60
R.errs=errs.slice(0,3)
await p.screenshot({path:new URL('./resize.png',import.meta.url).pathname, clip:{x:Math.max(0,before.x-30),y:Math.max(0,before.y-30),width:640,height:420}})
console.log('RESIZE '+JSON.stringify(R))
await b.close()
