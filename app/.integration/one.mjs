import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(600)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+500, pb.y+280); await p.waitForTimeout(200)
await p.mouse.click(pb.x+520, pb.y+600); await p.waitForTimeout(200)
await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
const A=p.locator('.vue-flow__node-feature').nth(0), B=p.locator('.vue-flow__node-feature').nth(1)
const sb=await A.boundingBox(), tb=await B.boundingBox()
await A.hover(); await p.waitForTimeout(200)
R.edgesBefore=await p.locator('.vue-flow__edge').count()
await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height-2); await p.mouse.down()
await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:18}); await p.waitForTimeout(150); await p.mouse.up()
await p.waitForTimeout(600) // wait for nextTick re-render
R.edgesAfterOne = await p.locator('.vue-flow__edge').count()
R.edgePathVisible = await p.locator('.vue-flow__edge path.vue-flow__edge-path').count()
R.occupiedPorts = await A.locator('.dep-dot').count()  // occupied port dots on A
R.errs=errs
await p.screenshot({ path: new URL('./one.png', import.meta.url).pathname, clip:{x:pb.x+300,y:pb.y+200,width:500,height:560} })
console.log('ONE '+JSON.stringify(R))
await b.close()
