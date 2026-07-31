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
const card = await p.locator('.vue-flow__node-feature').first().boundingBox()
await p.mouse.move(card.x+card.width/2, card.y+card.height/2); await p.waitForTimeout(100)
await p.mouse.move(card.x+card.width/2, card.y+card.height-8); await p.waitForTimeout(200)
R.plusCount = await p.locator('.add-adjacent').count()
R.plusVisible = await p.locator('.add-adjacent').first().isVisible().catch(()=>false)
const pb = await p.locator('.add-adjacent').first().boundingBox().catch(()=>null)
R.plusBox = pb ? {x:Math.round(pb.x),y:Math.round(pb.y),w:Math.round(pb.width)} : null
R.cardBottom = Math.round(card.y+card.height)
R.errs=errs.slice(0,3)
await p.screenshot({path:new URL('./plushover.png',import.meta.url).pathname, clip:{x:Math.max(0,card.x-40),y:Math.max(0,card.y-40),width:400,height:320}})
console.log('PLUSHOVER '+JSON.stringify(R))
await b.close()
