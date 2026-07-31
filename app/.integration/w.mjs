import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
p.on('dialog', d=>d.accept())
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(500)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+300, pb.y+300); await p.waitForTimeout(300)
await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
const info = await p.evaluate(()=>{
  const el=document.querySelector('.vue-flow__node-feature')
  const inner=el?.querySelector('.feature-node')
  return { nodeStyleWidth: el?.style.width, nodeStyleHeight: el?.style.height,
           nodeClientW: el?.clientWidth, innerClientW: inner?.clientWidth,
           nodeCls: el?.className }
})
console.log('W '+JSON.stringify(info))
await b.close()
