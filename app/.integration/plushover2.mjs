import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1400,height:950},deviceScaleFactor:1}).then(c=>c.newPage())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell'); await p.waitForTimeout(300)
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:2000}); await p.click('button[role="menuitem"]:has-text("Nouveau")',{timeout:2000}); await p.waitForTimeout(300)}catch(e){}
await p.click('button:has-text("Fonctionnalités")'); await p.waitForTimeout(200)
await p.keyboard.press('m'); await p.mouse.click(400,300); await p.waitForTimeout(300)
await p.mouse.dblclick(400+120, 300+70); await p.waitForTimeout(300)
const node = p.locator('.vue-flow__node-feature').first()
await node.hover(); await p.waitForTimeout(200)
R.afterHover = await p.locator('.add-adjacent').count()
// try dispatching a real mousemove via bounding box with steps
const c = await node.boundingBox()
await p.mouse.move(c.x+10, c.y+10); await p.mouse.move(c.x+c.width/2, c.y+c.height-10, {steps:5}); await p.waitForTimeout(200)
R.afterMove = await p.locator('.add-adjacent').count()
// check the root div has the handler by evaluating hover class / structure
R.rootHtml = await node.evaluate(el => { const d=el.querySelector('.group'); return d? d.className.slice(0,60): 'no-group' })
console.log('PH2 '+JSON.stringify(R))
await b.close()
