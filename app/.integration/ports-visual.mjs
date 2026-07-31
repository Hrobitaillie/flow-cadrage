import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor:2 }).then(c=>c.newPage())
p.on('dialog',d=>d.accept())
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' }); await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(600)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+520, pb.y+240); await p.waitForTimeout(200)  // A top
await p.mouse.click(pb.x+330, pb.y+560); await p.waitForTimeout(200)  // B bottom-left
await p.mouse.click(pb.x+710, pb.y+560); await p.waitForTimeout(200)  // C bottom-right
await p.keyboard.press('v'); await p.waitForTimeout(200)
const N=i=>p.locator('.vue-flow__node-feature').nth(i)
async function drag(si,tx,ty){ const s=N(si); const sb=await s.boundingBox(); await s.hover(); await p.waitForTimeout(180); await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height-2); await p.mouse.down(); await p.mouse.move(tx,ty,{steps:18}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(400) }
{ const bb=await N(1).boundingBox(); await drag(0, bb.x+bb.width/2, bb.y+bb.height/2) }
{ const cb=await N(2).boundingBox(); await drag(0, cb.x+cb.width/2, cb.y+cb.height/2) }
await N(0).hover(); await p.waitForTimeout(200)  // reveal A ports
await p.screenshot({ path: new URL('./ports.png', import.meta.url).pathname, clip:{x:pb.x+230,y:pb.y+150,width:720,height:560} })
await b.close()
